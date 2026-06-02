// Canonical top-level key order for `package.json` files.
// Used by `enforceFieldOrder(canonicalPackageJsonOrder)` at the end of
// every `*-package-json.ts` body (content-rules.md § "JSON Field Order").
// Per-block extensions: rules call
// `enforceFieldOrder([...canonicalPackageJsonOrder, "customKey"])`.
//
// This order is derived EMPIRICALLY from oxfmt (the canonical formatter run
// by `ts-builder check`): a freshly-refreshed package.json must pass
// `oxfmt --check` so `pnpm check` is green without a prior `pnpm fmt`. oxfmt
// also alphabetises the dependency sections — the `*-package-json.ts` bodies
// call `enforceAlphabeticalOrder` on each dep section to match (scripts and
// `exports` keep source order; oxfmt does not reorder them).
export const canonicalPackageJsonOrder = [
  "name",
  "version",
  "private",
  "description",
  "keywords",
  "files",
  "type",
  "main",
  "module",
  "types",
  "exports",
  "scripts",
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "packageManager",
  "pnpm",
  "block",
  "block-software",
] as const;
