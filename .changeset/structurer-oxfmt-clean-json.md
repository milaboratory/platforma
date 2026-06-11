---
"@platforma-sdk/block-tools": patch
---

structure: emit oxfmt-clean JSON for managed non-package.json files

The structurer's JSON serialiser now matches oxfmt's generic-.json formatting
for managed/generated files other than package.json (e.g. tsconfig.json):
objects stay expanded one property per line, while arrays collapse onto a
single line when they fit the print width. Previously `JSON.stringify`
expanded every array, so the single-element `include` array in a block's
`tsconfig.json` failed `ts-builder check` (oxfmt 0.35 collapses it) unless a
`pnpm fmt` ran first — which then broke the structure fixpoint. Refresh output
is now both oxfmt-clean and a structure fixpoint with no intervening format
pass. package.json output is unchanged (fully expanded, as oxfmt formats it).

Also in this release:

- fix(registry): `fetchWithRetry` now wraps only the `fetch()` call in its
  try/catch (transport errors are retryable), with HTTP-status handling moved
  outside the catch so a non-retryable status (404/403) throws immediately
  instead of being swallowed and retried.
- refactor(engine): the structurer engine core is now fully synchronous. The
  `FileSystem` abstraction and everything built on it (runner, discovery,
  version, builders, the run-context scope) drop their Promises; only the npm
  registry client and the CLI's pre-run network prefetch stay async. This
  removes the module-global run-context race by construction — a sync call
  stack cannot interleave — and leaves all generated output byte-identical.
