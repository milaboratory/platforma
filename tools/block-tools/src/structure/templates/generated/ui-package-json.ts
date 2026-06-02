// Initial UI `package.json` — full canonical content (Path A).

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
    peerDependencies: {
      // "@types/node": "*",  // dropped (c6) — candidate for full removal after 5b
      typescript: "*", // IDE-only, questionable; candidate for removal later (c7)
    },
    devDependencies: {
      "@milaboratories/ts-builder": "sdk:",
      "@milaboratories/ts-configs": "sdk:",
      vitest: "catalog:",
    },
  };
}
