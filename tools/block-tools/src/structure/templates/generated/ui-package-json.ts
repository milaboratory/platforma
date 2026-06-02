// Initial UI `package.json` — full canonical content (Path A).

import type { BlockVars } from "../../engine/api";

export function uiPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.ui`,
    version: "1.0.0",
    type: "module",
    scripts: {
      fmt: "ts-builder format",
      watch: "ts-builder build --target block-ui --watch",
      build: "ts-builder build --target block-ui",
      check: "ts-builder check --target block-ui",
    },
    dependencies: {
      "@platforma-sdk/ui-vue": "catalog:",
    },
    peerDependencies: {
      "@types/node": "*",
      typescript: "*",
    },
    devDependencies: {
      "@milaboratories/ts-builder": "catalog:",
      "@milaboratories/ts-configs": "catalog:",
      "@platforma-sdk/block-tools": "catalog:",
    },
  };
}
