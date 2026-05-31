// Initial UI `package.json`. Authored oxfmt-clean: the ui is one of the
// two scopes `ts-builder check` runs oxfmt on, so the body cedes ordering
// to oxfmt (no enforce* calls there).

import type { BlockVars } from "../../engine/api";

export function uiPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.ui`,
    version: "1.0.0",
    type: "module",
    scripts: {
      fmt: "ts-builder format",
      dev: "ts-builder serve --target block-ui",
      watch: "ts-builder build --target block-ui --watch",
      build: "ts-builder build --target block-ui",
      check: "ts-builder check --target block-ui",
      test: "vitest run --passWithNoTests",
    },
    dependencies: {
      "@platforma-sdk/ui-vue": "sdk:",
    },
    devDependencies: {
      "@milaboratories/ts-builder": "sdk:",
      "@milaboratories/ts-configs": "sdk:",
      vitest: "catalog:",
    },
    peerDependencies: {
      typescript: "*",
    },
  };
}
