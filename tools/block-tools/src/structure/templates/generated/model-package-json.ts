// Initial model `package.json` — full canonical content (Path A).
// Body rules in rules/model-package-json.ts re-assert the same fields
// as drift-correctors (templates-strategy.md § "Generator Form In Use").

import type { BlockVars } from "../../engine/api";

export function modelPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.model`,
    version: "1.0.0",
    type: "module",
    main: "dist/index.js",
    types: "dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        sources: "./src/index.ts",
        import: "./dist/index.js",
      },
      "./dist/*": "./dist/*",
    },
    scripts: {
      fmt: "ts-builder format",
      watch: "ts-builder build --target block-model --watch",
      build: "ts-builder build --target block-model && block-tools build-model",
      check: "ts-builder check --target block-model",
    },
    dependencies: {
      "@platforma-sdk/model": "catalog:",
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
