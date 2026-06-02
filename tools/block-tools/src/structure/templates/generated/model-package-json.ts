// Initial model `package.json`. Body rules in
// rules/model-package-json.ts re-assert the same fields as
// drift-correctors. Authored oxfmt-clean: the model is one of the two
// scopes `ts-builder check` runs oxfmt on, so the body cedes field /
// dependency ordering to oxfmt (no enforce* calls there).

import type { BlockVars } from "../../engine/api";

export function modelPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.model`,
    version: "1.0.0",
    type: "module",
    // The block-model build emits both index.cjs and index.js. `main` is
    // the CommonJS entry (require fallback); `module` the ESM entry.
    // Matches the modern production convention (clonotype-clustering).
    main: "dist/index.cjs",
    module: "dist/index.js",
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
      test: "vitest run --passWithNoTests",
    },
    dependencies: {
      "@platforma-sdk/model": "sdk:",
    },
    devDependencies: {
      "@milaboratories/ts-builder": "sdk:",
      "@milaboratories/ts-configs": "sdk:",
      "@platforma-sdk/block-tools": "sdk:",
      vitest: "catalog:",
    },
    peerDependencies: {
      "@types/node": "*",
      typescript: "*",
    },
  };
}
