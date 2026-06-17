// Workflow `package.json`: the initial generator and the drift-correcting
// body rules, co-located. Workflow packages reference software modules at
// workspace level when the block has any; the generator fills them from the
// discovered modules and the body rule re-asserts them.

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDeps,
  removeDep,
  ensureWorkspaceScopeDeps,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  when,
  whenFilesExist,
  type RunContext,
} from "../engine/api";
import { scopeDepMaps } from "../engine/ctx";
import { canonicalPackageJsonOrder } from "./shared/key-order";
import { COLOCATED_TEST_GLOB } from "./shared/colocated-tests";
import { removeRetiredToolchainDeps } from "./shared/retired-deps";

export function workflowPackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
  return {
    name: `${v.facadeName}.workflow`,
    version: "1.0.0",
    type: "module",
    scripts: {
      // No `fmt`: the workflow is Tengo, not TS — nothing for oxlint/oxfmt
      // to process. Tengo is built and checked by pl-tengo.
      build: "shx rm -rf dist && pl-tengo build",
      check: "pl-tengo check",
      // No `test`: the vitest `test` script is wired by the body rule ONLY
      // when co-located test files exist (a freshly-init'd workflow has none).
      // Tengo source formatter (emacs batch). Falls back to a notice when
      // emacs is absent, so the script never hard-fails the environment.
      format: "/usr/bin/env emacs --script ./format.el || echo 'No emacs.'",
    },
    dependencies: {
      "@platforma-sdk/workflow-tengo": "sdk:",
      // Every block-local software module as a workspace dep (zero or more).
      ...scopeDepMaps(ctx, "software"),
    },
    devDependencies: {
      "@platforma-sdk/tengo-builder": "sdk:",
      "@platforma-sdk/test": "sdk:",
      // `vitest` is NOT seeded here — it's wired by the body rule only when the
      // workflow carries co-located tests (a freshly-init'd workflow has none).
      shx: "catalog:",
    },
  };
}

export function workflowPackageJsonRules(): void {
  ensureField("type", "module");

  // No `fmt` script: the workflow is Tengo, not TS — build + check run via
  // pl-tengo; `format` runs the emacs-batch Tengo formatter (no-op when absent).
  ensureScript("build", "shx rm -rf dist && pl-tengo build");
  ensureScript("check", "pl-tengo check");
  ensureScript("format", "/usr/bin/env emacs --script ./format.el || echo 'No emacs.'");
  // The vitest `test` script AND the `vitest` devDep are wired ONLY when the
  // workflow carries co-located integration tests (`src/**/*.test.ts`, incl.
  // `src/test/`). A test-less workflow gets neither — no `test` task, no
  // vitest dep — and stays a refresh fixpoint. (Workflow tests type-check via
  // the standalone workflow/tsconfig with `types: []` — they pull their types
  // from `@platforma-sdk/test` — so no node-types wiring is needed here,
  // unlike model/ui.)
  //
  // Skipped entirely for sdk-internal (in-monorepo) blocks: they own their test
  // wiring under the monorepo's shared infrastructure — see model-package-json.
  when(
    ({ ctx }) => !ctx.isSdkInternal,
    () =>
      when(
        whenFilesExist(COLOCATED_TEST_GLOB),
        () => {
          ensureScript("test", "vitest run --passWithNoTests");
          ensureDevDeps({ vitest: "catalog:" });
        },
        () => removeDep("vitest"),
      ),
  );

  ensureDep("@platforma-sdk/workflow-tengo", "sdk:");

  // Pulls in every block-local software module as a workspace dep so the
  // workflow can reference the produced runenv assets.
  ensureWorkspaceScopeDeps("software");

  // @platforma-sdk/test: workflow integration tests (e.g. mixcr's
  // workflow/src/test/columns.test.ts) import it.
  ensureDevDeps({
    "@platforma-sdk/tengo-builder": "sdk:",
    "@platforma-sdk/test": "sdk:",
    shx: "catalog:",
  });

  // No-op for a canonical Tengo workflow; called uniformly across every scope
  // for safety.
  removeRetiredToolchainDeps();

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
