// Initial root `package.json` — full canonical content (Path A).
// Body rules in rules/root-package-json.ts re-assert the same fields
// as drift-correctors.

import type { BlockVars } from "../../engine/api";

export function rootPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: v.facadeName,
    version: "1.0.0",
    private: true,
    scripts: {
      fmt: "turbo run fmt",
      check: "turbo run check",
      build: "turbo run build",
      test: "turbo run test",
      "update-sdk": "block-tools structure refresh --update-deps",
    },
    peerDependencies: {
      oxlint: "*",
      oxfmt: "*",
    },
    devDependencies: {
      "@changesets/cli": "catalog:",
      "@milaboratories/ts-builder": "catalog:",
      "@platforma-sdk/block-tools": "catalog:",
      shx: "catalog:",
      turbo: "catalog:",
    },
    packageManager: "pnpm@9.12.0",
  };
}
