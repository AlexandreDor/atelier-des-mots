# Project glob adapter

This project-owned package replaces the vulnerable `fast-glob → micromatch →
braces` chain using npm's local-file override. The root's direct `fast-glob`
dependency and `$fast-glob` override make npm resolve the local file from the
root, including on clean installs; installed metadata records the actual adapter
name. Its package name and version are its own; it contains no renamed copy of
an upstream vulnerable parser.

Only `globSync(patterns, { onlyDirectories })` (Next ESLint's `getRootDirs`) and
the CommonJS/default import's `sync(patterns, { cwd })` (Vite's dynamic import
plugin) are supported. Unknown options throw explicitly. Async, streaming,
filesystem-adapter and other fast-glob APIs are outside this adapter's contract.
Dependency updates must run the caller integration tests and reassess this
contract before adding further options or APIs.

`tinyglobby` supplies filesystem traversal and matching with directory expansion
disabled. Results preserve each pattern's literal path prefix, including parent
paths and `./`, without adding directory suffixes. Absolute matching from the volume
root avoids tinyglobby's pruning of parent-relative globstars.

All input patterns are checked before matching. The supported grammar has at
most one `*` per path segment, and one standalone `**` segment per pattern.
`?` and simple character classes (for example `[a-z]`) consume single characters.
Each segment may have one flat brace list of literal alternatives (for example
`*.{ts,js}`) and one flat `@(a|b)` or `!(a|b)` extglob with literal alternatives.
An extglob segment cannot also contain `*`. Alternatives contain only Unicode
letters/numbers, spaces, dots, underscores and hyphens. Escaped metacharacters
are literals; metacharacters in `cwd` are escaped before matching.

Raw regex groups, nested choices, brace ranges, quantified extglobs (`+()`, `*()`,
`?()`), and repeated stars within a segment are rejected with `SyntaxError`.
These forms can cause catastrophic backtracking even when short and shallow;
size/depth limits alone do not protect the matching boundary. There are also
limits of 256 patterns, 4096 characters per pattern, 128 choice groups, 32
alternatives per group and 128 characters per alternative; exceeding those
limits throws `RangeError`. Rejected patterns are never silently truncated.
The installed callers' short directory globs and flat extension lists remain
covered by integration tests. This subset deliberately excludes parts of the
upstream fast-glob pattern language, including otherwise legitimate repeated
wildcards and complex extglobs.

The scoped esbuild override in the root manifest upgrades only
`@esbuild-kit/core-utils`, used by Drizzle Kit's legacy TypeScript loader. Tests
exercise its synchronous CommonJS and asynchronous ESM transforms; disposable
database generation also checks the real CLI without changing migration files.
