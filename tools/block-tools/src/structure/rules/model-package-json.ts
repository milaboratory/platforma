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
  ensureDevDep,
  ensureDevDeps,
  removeDep,
  removeScript,
  removeField,
  ensurePeerDeps,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  when,
  whenFilesExist,
  type RunContext,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";
import { COLOCATED_TEST_GLOB } from "./shared/colocated-tests";
import { removeRetiredToolchainDeps } from "./shared/retired-deps";

export function modelPackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
  return {
    name: `${v.facadeName}.model`,
    private: true,
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
    },
    dependencies: {
      "@platforma-sdk/model": "sdk:",
    },
    devDependencies: {
      "@milaboratories/ts-builder": "sdk:",
      "@milaboratories/ts-configs": "sdk:",
      "@platforma-sdk/block-tools": "sdk:",
    },
    peerDependencies: {
      "@types/node": "*",
      typescript: "*",
    },
  };
}

export function modelPackageJsonRules(): void {
  // Controlled sibling — workspace-only, never published. `private: true` makes
  // npm refuse to publish it; the `version` is kept (changesets-owned) so the
  // packed template's lib carries a version.
  ensureField("private", true);

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

  ensureDep("@platforma-sdk/model", "sdk:");

  ensureDevDeps({
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    "@platforma-sdk/block-tools": "sdk:",
  });

  ensurePeerDeps({
    "@types/node": "*",
    typescript: "*",
  });

  // The vitest `test` script, the `vitest` devDep, and node ambient types are
  // wired ONLY when the model carries co-located unit tests (`src/**/*.test.ts`).
  // A test-less model gets none — turbo simply has no `test` task for it, and
  // the scope stays a refresh fixpoint. When tests ARE present, `@types/node`
  // is promoted from peer to a devDep (the single-section invariant drops the
  // peer) so the tests' `node:*` imports resolve under the `types: ["node"]`
  // that model/tsconfig adds under the same predicate. Runs AFTER ensurePeerDeps
  // so the promotion is not reverted.
  //
  // Skipped entirely for sdk-internal (in-monorepo) blocks: those live inside
  // the platforma monorepo's own test infrastructure (build-configs, shared
  // catalog, coverage providers) and own their test wiring — the structurer
  // must not impose or strip standalone-block test conventions on them.
  when(
    ({ ctx }) => !ctx.isSdkInternal,
    () =>
      when(
        whenFilesExist(COLOCATED_TEST_GLOB),
        () => {
          ensureScript("test", "vitest run --passWithNoTests");
          ensureDevDep("vitest", "catalog:");
          ensureDevDep("@types/node", "*");
        },
        () => removeDep("vitest"),
      ),
  );

  removeRetiredToolchainDeps();
  removeField("tsup");
  removeScript("lint");

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
