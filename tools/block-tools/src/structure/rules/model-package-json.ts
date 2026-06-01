// Model `package.json`: the initial generator and the drift-correcting body
// rules, co-located. Identity (name/version) stays untouched; the body
// enforces type/main/types/exports + canonical scripts + canonical dep sets,
// then projects canonical field / dependency order.
//
// Authored oxfmt-clean: the model is one of the two scopes `ts-builder
// check` runs oxfmt on, so neither half enforces field / dependency ordering
// beyond what oxfmt itself produces — the enforce* calls match oxfmt's order
// exactly, so refreshing a legacy block yields oxfmt-clean output and the
// build→check gate (oxfmt --check) passes without a prior `pnpm fmt`.

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDeps,
  ensurePeerDeps,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type RunContext,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function modelPackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
  return {
    name: `${v.facadeName}.model`,
    version: "1.0.0",
    type: "module",
    // The block-model build emits both index.cjs and index.js. `main` is
    // the CommonJS entry (require fallback); `module` the ESM entry.
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

export function modelPackageJsonRules(): void {
  ensureField("type", "module");
  // build emits both; main = CJS entry, module = ESM entry (prod convention).
  ensureField("main", "dist/index.cjs");
  ensureField("module", "dist/index.js");
  ensureField("types", "dist/index.d.ts");
  ensureField("exports", {
    ".": {
      types: "./dist/index.d.ts",
      sources: "./src/index.ts",
      import: "./dist/index.js",
    },
    "./dist/*": "./dist/*",
  });

  ensureScript("fmt", "ts-builder format");
  ensureScript("watch", "ts-builder build --target block-model --watch");
  ensureScript("build", "ts-builder build --target block-model && block-tools build-model");
  ensureScript("check", "ts-builder check --target block-model");
  // --passWithNoTests: real blocks put unit tests in model/ (mixcr,
  // sequence-properties); models with no test files don't fail `turbo run
  // test`.
  ensureScript("test", "vitest run --passWithNoTests");

  ensureDep("@platforma-sdk/model", "sdk:");

  ensureDevDeps({
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    "@platforma-sdk/block-tools": "sdk:",
    vitest: "catalog:",
  });

  ensurePeerDeps({
    "@types/node": "*",
    typescript: "*",
  });

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
