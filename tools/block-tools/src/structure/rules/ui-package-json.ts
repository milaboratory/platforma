// UI `package.json`: the initial generator and the drift-correcting body
// rules, co-located.
//
// Authored oxfmt-clean: the ui is one of the two scopes `ts-builder check`
// runs oxfmt on, so neither half enforces ordering beyond what oxfmt
// produces — the enforce* calls match oxfmt's order exactly, so refreshing a
// legacy block yields oxfmt-clean output and the build→check gate (oxfmt
// --check) passes without a prior `pnpm fmt`.

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDep,
  ensureDevDeps,
  ensurePeerDeps,
  ensureWorkspaceScopeDeps,
  removeDep,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  when,
  whenFilesExist,
  type RunContext,
} from "../engine/api";
import { scopeDepMap } from "../engine/ctx";
import { canonicalPackageJsonOrder } from "./shared/key-order";
import { COLOCATED_TEST_GLOB } from "./shared/colocated-tests";

export function uiPackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
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
      // No `test`: the vitest `test` script is wired by the body rule ONLY
      // when co-located test files exist (a freshly-init'd ui has none).
    },
    dependencies: {
      "@platforma-sdk/ui-vue": "sdk:",
      vue: "catalog:",
      // The seeded ui (app.ts) imports the block's model package; depend on
      // it — mirrors the body rule's `ensureWorkspaceScopeDeps("model")`.
      ...scopeDepMap(ctx, "model"),
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

export function uiPackageJsonRules(): void {
  ensureField("type", "module");

  ensureScript("fmt", "ts-builder format");
  ensureScript("dev", "ts-builder serve --target block-ui");
  ensureScript("watch", "ts-builder build --target block-ui --watch");
  ensureScript("build", "ts-builder build --target block-ui");
  ensureScript("check", "ts-builder check --target block-ui");

  ensureDep("@platforma-sdk/ui-vue", "sdk:");
  // The seeded ui (main.ts) imports `createApp` from vue.
  ensureDep("vue", "catalog:");
  // The seeded ui (app.ts) imports the block's model package.
  ensureWorkspaceScopeDeps("model");

  ensureDevDeps({
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    vitest: "catalog:",
  });

  // The ui builds with `--target block-ui` (types: []), so by default it
  // carries no browser/vitest/node ambient types — only the `typescript`
  // peer for IDE type resolution. Drop any stray `@types/node` a legacy
  // block declares...
  ensurePeerDeps({
    typescript: "*",
  });
  removeDep("@types/node");

  // ...but a ui WITH co-located unit tests (`src/**/*.test.ts`) needs the
  // vitest `test` script AND node ambient types: re-add `@types/node` as a
  // devDep so `types: ["node"]` in ui/tsconfig (wired under the same
  // predicate) resolves the tests' `node:*` imports. A test-less ui keeps
  // the lean default (no test script, no @types/node) and stays a fixpoint.
  // Runs AFTER removeDep so the dev dep is not stripped.
  when(whenFilesExist(COLOCATED_TEST_GLOB), () => {
    ensureScript("test", "vitest run --passWithNoTests");
    ensureDevDep("@types/node", "*");
  });

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
