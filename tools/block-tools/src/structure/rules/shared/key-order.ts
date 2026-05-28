// Canonical top-level key order for `package.json` files.
// Used by `enforceFieldOrder(canonicalPackageJsonOrder)` at the end of
// every `*-package-json.ts` body (content-rules.md § "JSON Field Order").
// Per-block extensions: rules call
// `enforceFieldOrder([...canonicalPackageJsonOrder, "customKey"])`.

export const canonicalPackageJsonOrder = [
  "name",
  "version",
  "private",
  "description",
  "keywords",
  "type",
  "main",
  "types",
  "exports",
  "files",
  "scripts",
  "dependencies",
  "peerDependencies",
  "devDependencies",
  "optionalDependencies",
  "block",
  "block-software",
  "packageManager",
  "pnpm",
] as const;
