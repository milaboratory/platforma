// Initial root `package.json` — full canonical content (Path A).
// Body rules in rules/root-package-json.ts re-assert the same fields
// as drift-correctors.

import type { BlockVars } from "../../engine/api";

export function rootPackageJsonInitial(_v: BlockVars): Record<string, unknown> {
  // No `name`: the root is never published (D2). Body rules re-assert
  // (removeField("name")) as a drift-corrector.
  return {
    version: "1.0.0",
    private: true,
    scripts: {
      fmt: "turbo run fmt",
      check: "turbo run check",
      build: "turbo run build",
      "build:dev": "env PL_PKG_DEV=local turbo run build",
      test: "env PL_PKG_DEV=local turbo run test --concurrency 1",
      "test:dry-run": "env PL_PKG_DEV=local turbo run test --dry-run=json",
      "mark-stable": "turbo run mark-stable",
      watch: "turbo watch build",
      changeset: "changeset",
      "version-packages": "changeset version",
      "update-sdk": "block-tools structure refresh --update-deps-only",
      update:
        "block-tools structure refresh --update-deps-only && pnpm i && block-tools structure refresh",
    },
    peerDependencies: {
      oxlint: "*",
      oxfmt: "*",
    },
    devDependencies: {
      "@changesets/cli": "catalog:",
      "@milaboratories/ts-builder": "sdk:",
      "@platforma-sdk/block-tools": "sdk:",
      shx: "catalog:",
      turbo: "catalog:",
    },
    packageManager: "pnpm@9.12.0",
  };
}
