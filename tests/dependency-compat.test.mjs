import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const adapter = require("../packages/fast-glob-compat/index.cjs");
const nextRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
const vinextRequire = createRequire(import.meta.resolve("vinext"));
const dynamicRequire = createRequire(vinextRequire.resolve("vite-plugin-dynamic-import"));
const rootDir = path.resolve(import.meta.dirname, "..");

async function fixture(t) {
  // Glob metacharacters in cwd must be treated literally.
  const cwd = await mkdtemp(path.join(os.tmpdir(), "glob-adapter-[fixture]-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const filename of ["apps/site/page.tsx", "apps/admin/page.tsx", "apps/.hidden/page.tsx", "src/views/a.ts", "src/views/b.js", "src/views/skip.ts", "src/views/.hidden.ts", "src/views/deep/c.ts", "src/main.ts"]) {
    await mkdir(path.dirname(path.join(cwd, filename)), { recursive: true });
    await writeFile(path.join(cwd, filename), "export default 42;\n");
  }
  return cwd;
}

test("the real Next and Vite callers resolve the project-owned adapter", () => {
  for (const caller of [nextRequire, dynamicRequire]) {
    const installed = caller("fast-glob");
    assert.equal(installed.sync, adapter.sync);
    assert.equal(installed.globSync, adapter.globSync);
    assert.equal(caller("fast-glob/package.json").name, "@atelier-des-mots/fast-glob-compat");
  }
});

test("sync matching retains caller paths, defaults, arrays, exclusions, braces and extglobs", async (t) => {
  const cwd = await fixture(t);
  const matches = (patterns, options = {}) => adapter.sync(patterns, { cwd, ...options }).sort();
  assert.deepEqual(matches("./src/views/*.{ts,js}"), ["./src/views/a.ts", "./src/views/b.js", "./src/views/skip.ts"]);
  assert.deepEqual(matches(["src/views/*.ts", "src/views/*.js", "!src/views/skip.*"]), ["src/views/a.ts", "src/views/b.js"]);
  assert.deepEqual(matches("src/views/@(a|b).{ts,js}"), ["src/views/a.ts", "src/views/b.js"]);
  // Negative extglobs explicitly match dot entries in fast-glob/picomatch.
  assert.deepEqual(matches("src/views/!(skip).ts"), ["src/views/.hidden.ts", "src/views/a.ts"]);
  assert.deepEqual(matches("src/views/.hidden.ts"), ["src/views/.hidden.ts"]);
  assert.deepEqual(matches("src/views"), []);
  assert.deepEqual(matches("./apps/*", { onlyDirectories: true }), ["./apps/admin", "./apps/site"]);
  assert.deepEqual(matches("apps/site", { onlyDirectories: true }), ["apps/site"]);
  assert.deepEqual(matches(path.join(cwd, "apps/*"), { onlyDirectories: true }), [path.join(cwd, "apps/admin"), path.join(cwd, "apps/site")]);
  assert.deepEqual(adapter.sync("../apps/**/page.tsx", { cwd: path.join(cwd, "src") }).sort(), ["../apps/admin/page.tsx", "../apps/site/page.tsx"]);
  assert.deepEqual(adapter.sync("../**/*.tsx", { cwd: path.join(cwd, "src") }).sort(), ["../apps/admin/page.tsx", "../apps/site/page.tsx"]);
  assert.deepEqual(matches("src/../apps/**/page.tsx"), ["src/../apps/admin/page.tsx", "src/../apps/site/page.tsx"]);
});

test("Next getRootDirs retains string, array, Windows separator and default settings", async (t) => {
  const cwd = await fixture(t);
  const { getRootDirs } = nextRequire("./utils/get-root-dirs.js");
  const context = (rootDir) => ({ cwd, settings: { next: { rootDir } } });
  assert.deepEqual(getRootDirs(context(undefined)), [cwd]);
  assert.deepEqual(getRootDirs(context(path.join(cwd, "apps/*"))).sort(), [path.join(cwd, "apps/admin"), path.join(cwd, "apps/site")]);
  assert.deepEqual(getRootDirs(context([path.join(cwd, "apps/site"), null])), [path.join(cwd, "apps/site")]);
  assert.deepEqual(getRootDirs(context(path.join(cwd, "apps/site").replaceAll("/", "\\"))), [path.join(cwd, "apps/site")]);
});

test("Vite dynamic-import transforms real relative, parent and normalized-prefix imports", async (t) => {
  const cwd = await fixture(t);
  const { default: dynamicImport } = await import(pathToFileURL(vinextRequire.resolve("vite-plugin-dynamic-import/dist/index.mjs")));
  for (const options of [{}, { loose: false }]) {
    const plugin = dynamicImport(options);
    plugin.configResolved({ resolve: { alias: [] }, optimizeDeps: {}, createResolver: () => async () => undefined });
    for (const prefix of ["./views/", "../src/views/", "./views/../views/"]) {
      const source = "export const load = name => import(`" + prefix + "${name}.ts`);";
      const output = await plugin.transform(source, path.join(cwd, "src/main.ts"));
      assert.ok(output?.code.includes("function __variableDynamicImportRuntime"), output?.code);
      for (const filename of ["a", "skip"]) {
        assert.ok(output.code.includes("case '" + prefix + filename + ".ts':"), output.code);
        assert.ok(output.code.includes("import('" + prefix + filename + ".ts')"), output.code);
      }
      assert.ok(!output.code.includes(".hidden.ts"));
    }
  }
});

test("recursive and backtracking glob forms reject before parsing in a bounded subprocess", () => {
  const script = `const assert = require('node:assert/strict');
    const glob = require(${JSON.stringify(path.join(rootDir, "packages/fast-glob-compat/index.cjs"))});
    const bad = ['{'.repeat(4000)+'a'+'}'.repeat(4000), 'a{b,'.repeat(4000)+'c'+'}'.repeat(4000), '@('.repeat(4000)+'a'+')'.repeat(4000), '{'.repeat(17)+'a'+'}'.repeat(17), '['+'{'.repeat(17)+'a', '('.repeat(17)+'x'+'}'.repeat(17),
      'app/data/([a-z.-]+)+Z', 'app/data/+([a-z.-]|[a-z.-][a-z.-]|[a-z.-][a-z.-][a-z.-])Z',
      'app/data/'+'*a'.repeat(20)+'Z', 'app/data/'+'*?'.repeat(18)+'Z', 'app/data/'+'*[a-z.-]'.repeat(18)+'Z',
      'app/data/(dictionaries|dictionary)*.json', 'app/data/@(a|aa)*Z', 'app/data/!(a|aa)*Z',
      'app/data/*(a|aa)Z', 'app/data/?(a|aa)Z', 'app/data/@(a|@(b))Z', 'app/data/{a,{b,c}}Z',
      'app/data/{1..1000000}Z', 'app/**/deep/**/*.json',
      'app/data/'+'{a,aa}'.repeat(25)+'Z', 'app/data/'+'@(a|aa)'.repeat(25)+'Z'];
    for (const pattern of bad) {
      assert.throws(() => glob.sync(pattern), /Unsupported glob syntax|exceeds/);
      assert.throws(() => glob.globSync(['app/*', '!'+pattern], {onlyDirectories: true}), /Unsupported glob syntax|exceeds/);
    }
    assert.throws(() => glob.sync(Array(257).fill('app/*')), RangeError);`;
  const result = spawnSync(process.execPath, ["--max-old-space-size=128", "-e", script], { encoding: "utf8", timeout: 1500 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
});

test("the supported grammar handles long filenames without ambiguous repeated matching", async (t) => {
  const cwd = await fixture(t);
  const filename = "a".repeat(200);
  await mkdir(path.join(cwd, "long"));
  await writeFile(path.join(cwd, "long", filename), "");
  const cases = [
    ["long/*Z", []],
    ["long/*?Z", []],
    ["long/*[a-z.-]Z", []],
    ["long/@(a|aa){a,aa}Z", []],
    ["long/!(a|aa){a,aa}Z", []],
    ["long/*", ["long/" + filename]],
    ["**/*.tsx", ["apps/admin/page.tsx", "apps/site/page.tsx"]],
  ];
  const script = `const assert = require('node:assert/strict');
    const glob = require(${JSON.stringify(path.join(rootDir, "packages/fast-glob-compat/index.cjs"))});
    for (const [pattern, expected] of ${JSON.stringify(cases)}) {
      assert.deepEqual(glob.sync(pattern, {cwd: ${JSON.stringify(cwd)}}).sort(), expected);
    }`;
  const result = spawnSync(process.execPath, ["--max-old-space-size=128", "-e", script], { encoding: "utf8", timeout: 1500 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
});

test("unsupported API options and malformed patterns fail explicitly", () => {
  assert.throws(() => adapter.sync("*", { dot: true }), /Unsupported glob option/);
  assert.throws(() => adapter.sync("*", { onlyDirectories: "yes" }), TypeError);
  assert.throws(() => adapter.sync(["app/*", 42]), TypeError);
  assert.throws(() => adapter.sync(""), TypeError);
});

test("Drizzle's core-utils loader retains TypeScript CommonJS and ESM transforms", async () => {
  const drizzleRequire = createRequire(require.resolve("drizzle-kit/api"));
  const core = drizzleRequire("@esbuild-kit/core-utils");
  const coreRequire = createRequire(drizzleRequire.resolve("@esbuild-kit/core-utils"));
  assert.equal(coreRequire("esbuild").version, "0.25.12");
  const source = "export const answer: number = 42;";
  const sync = core.transformSync(source, path.join(rootDir, "dependency-control.cts"));
  const sandboxModule = { exports: {} };
  vm.runInNewContext(sync.code, { module: sandboxModule, exports: sandboxModule.exports });
  assert.equal(sandboxModule.exports.answer, 42);
  assert.ok(sync.map.sources.some((value) => value.endsWith("dependency-control.cts")));
  const async = await core.transform(source, path.join(rootDir, "dependency-control.mts"));
  assert.equal((await import("data:text/javascript;base64," + Buffer.from(async.code).toString("base64"))).answer, 42);
  assert.ok(async.map.sources.some((value) => value.endsWith("dependency-control.mts")));
});
