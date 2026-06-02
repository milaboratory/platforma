// Workflow `package.json`: the initial generator and the drift-correcting
// body rules, co-located. Workflow packages reference software modules at
// workspace level when the block has any; the generator fills them from the
// discovered modules and the body rule re-asserts them.

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDeps,
  ensureWorkspaceScopeDeps,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type RunContext,
} from "../engine/api";
import { scopeDepMaps } from "../engine/ctx";
import { canonicalPackageJsonOrder } from "./shared/key-order";

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
      test: "vitest run --passWithNoTests",
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
      vitest: "catalog:",
      shx: "catalog:",
    },
  };
}

export function workflowPackageJsonRules(): void {
  ensureField("type", "module");

  // No `fmt`: the workflow is Tengo, not TS. Build + check go through
  // pl-tengo. shx powers the cross-platform build clean-up.
  ensureScript("build", "shx rm -rf dist && pl-tengo build");
  ensureScript("check", "pl-tengo check");
  ensureScript("test", "vitest run --passWithNoTests");
  // Tengo source formatter (emacs batch); no-op notice when emacs is absent.
  ensureScript("format", "/usr/bin/env emacs --script ./format.el || echo 'No emacs.'");

  ensureDep("@platforma-sdk/workflow-tengo", "sdk:");

  // Pulls in every block-local software module as a workspace dep so the
  // workflow can reference the produced runenv assets.
  ensureWorkspaceScopeDeps("software");

  // @platforma-sdk/test: workflow integration tests (e.g. mixcr's
  // workflow/src/test/columns.test.ts) import it.
  ensureDevDeps({
    "@platforma-sdk/tengo-builder": "sdk:",
    "@platforma-sdk/test": "sdk:",
    vitest: "catalog:",
    shx: "catalog:",
  });

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
