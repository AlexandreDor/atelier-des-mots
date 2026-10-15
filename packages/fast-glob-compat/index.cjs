/* eslint-disable @typescript-eslint/no-require-imports -- This adapter serves upstream CommonJS callers. */
const path = require("node:path");
const { escapePath, globSync: tinyGlobSync } = require("tinyglobby");
/* eslint-enable @typescript-eslint/no-require-imports */

// Validate a deliberately limited glob grammar before either tinyglobby or
// picomatch parses it. Size/depth limits alone still permit raw regex and
// repeated wildcards to cause catastrophic backtracking on real filenames.
function validatePattern(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) {
    throw new TypeError("Glob patterns must be nonempty strings");
  }
  if (pattern.length > 4096) throw new RangeError("Glob pattern exceeds 4096 characters");
  let groups = 0;
  let globstars = 0;
  const unsupported = () => { throw new SyntaxError("Unsupported glob syntax: use simple wildcards and flat literal alternatives"); };
  const alternatives = (body, separator, minimum) => {
    const parts = body.split(separator);
    if (parts.length < minimum || parts.some((part) => !/^[\p{L}\p{N}_. -]+$/u.test(part))) unsupported();
    if (parts.length > 32 || parts.some((part) => part.length > 128) || ++groups > 128) {
      throw new RangeError("Glob pattern exceeds supported alternative or group count");
    }
  };
  for (const segment of pattern.split("/")) {
    if (segment === "**") {
      if (++globstars > 1) unsupported();
      continue;
    }
    let stars = 0;
    let braces = 0;
    let extglobs = 0;
    for (let index = 0; index < segment.length; index++) {
      const character = segment[index];
      if (character === "\\") {
        if (++index === segment.length) unsupported();
        continue;
      }
      if ((character === "@" || character === "!") && segment[index + 1] === "(") {
        const close = segment.indexOf(")", index + 2);
        if (close < 0 || ++extglobs > 1) unsupported();
        alternatives(segment.slice(index + 2, close), "|", 1);
        index = close;
      } else if (character === "{") {
        const close = segment.indexOf("}", index + 1);
        if (close < 0 || ++braces > 1) unsupported();
        alternatives(segment.slice(index + 1, close), ",", 2);
        index = close;
      } else if (character === "[") {
        const close = segment.indexOf("]", index + 1);
        // Simple character classes consume exactly one character. Exclude
        // nesting, escapes and group syntax that could be reinterpreted.
        if (close < 0 || !/^[\p{L}\p{N}_.!^ -]+$/u.test(segment.slice(index + 1, close))) unsupported();
        index = close;
      } else if (character === "*") {
        if (++stars > 1) unsupported();
      } else if ("()+}|]".includes(character)) {
        unsupported();
      }
    }
    // Even flat repeated wildcard forms (*a*a... or *?*?...) backtrack
    // combinatorially. A negative extglob already has its own wildcard;
    // combining an extglob with another star is outside this safe subset.
    if (extglobs && stars) unsupported();
  }
}

function absolutePattern(cwd, pattern) {
  return path.posix.normalize(path.isAbsolute(pattern) ? pattern : `${escapePath(cwd)}/${pattern}`);
}

function resultPrefix(pattern) {
  const parts = pattern.split("/");
  const dynamicIndex = parts.findIndex((part) => /[*?{[()]/.test(part));
  // The prefix is retained in results: dynamic-import uses these strings in
  // runtime switch cases, where ./x/../y and ./y are distinct import strings.
  return parts.slice(0, dynamicIndex < 0 ? -1 : dynamicIndex).join("/") + (parts.length > 1 && dynamicIndex !== 0 ? "/" : "");
}

function globSync(patterns, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Glob options must be an object");
  for (const option of Object.keys(options)) {
    if (option !== "cwd" && option !== "onlyDirectories") throw new TypeError(`Unsupported glob option: ${option}`);
  }
  if (options.cwd !== undefined && typeof options.cwd !== "string") throw new TypeError("Glob cwd must be a string");
  if (options.onlyDirectories !== undefined && typeof options.onlyDirectories !== "boolean") throw new TypeError("Glob onlyDirectories must be a boolean");
  const inputs = typeof patterns === "string" ? [patterns] : patterns;
  if (!Array.isArray(inputs)) throw new TypeError("Glob patterns must be a string or array");
  if (inputs.length > 256) throw new RangeError("Glob input exceeds 256 patterns");
  inputs.forEach(validatePattern);
  const cwd = path.resolve(options.cwd ?? process.cwd()).replace(/\\/g, "/");
  const negatives = inputs.filter((pattern) => pattern.startsWith("!") && !pattern.startsWith("!("))
    .map((pattern) => absolutePattern(cwd, pattern.slice(1)));
  const positives = inputs.filter((pattern) => !pattern.startsWith("!") || pattern.startsWith("!("));
  const results = new Set();
  for (const pattern of positives) {
    const prefix = resultPrefix(pattern);
    const anchor = path.resolve(cwd, prefix);
    const files = tinyGlobSync(absolutePattern(cwd, pattern), {
      // A cwd below a ../ glob can incorrectly prune its own ancestor in
      // tinyglobby. Absolute matching from the volume root avoids that bug;
      // tinyglobby still narrows the crawl using each pattern's static prefix.
      cwd: path.parse(cwd).root,
      absolute: true,
      expandDirectories: false,
      onlyDirectories: options.onlyDirectories ?? false,
      onlyFiles: !options.onlyDirectories,
      ignore: negatives,
    });
    for (const file of files) {
      const relative = path.relative(anchor, file).replace(/\\/g, "/");
      results.add(prefix + relative || ".");
    }
  }
  return [...results];
}

// This intentionally supports only the synchronous APIs used by the two
// installed callers. It is not a drop-in implementation of all fast-glob APIs.
exports.globSync = globSync;
exports.sync = globSync;
