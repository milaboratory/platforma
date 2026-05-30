// Workflow `package.json` content rules.
// Workflow packages reference software modules at workspace level when
// the block has any (ensureWorkspaceScopeDeps("software")).

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDeps,
  ensureWorkspaceScopeDeps,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function workflowPackageJsonRules(): void {
  ensureField("type", "module");

  // No `fmt`: the workflow is Tengo, not TS (nothing for ts-builder/oxlint to
  // process). Build + check go through pl-tengo. See the linter side-quest.
  // shx (not bare rm -rf) for cross-platform robustness, like the rest of the
  // monorepo. (c8)
  ensureScript("build", "shx rm -rf dist && pl-tengo build");
  ensureScript("check", "pl-tengo check");
  ensureScript("test", "vitest run --passWithNoTests");

  ensureDep("@platforma-sdk/workflow-tengo", "sdk:");

  // Pulls in every block-local software module as a workspace dep so
  // the workflow can reference the produced runenv assets.
  ensureWorkspaceScopeDeps("software");

  // @platforma-sdk/test: workflow integration tests (e.g. mixcr's
  // workflow/src/test/columns.test.ts) import it. The boilerplate workflow
  // carries it; without it the canonical `test` script fails to resolve the
  // import (the 5b "mixcr workflow test" blocker). F resolution: add the dep.
  ensureDevDeps({
    "@platforma-sdk/tengo-builder": "sdk:",
    "@platforma-sdk/test": "sdk:",
    vitest: "catalog:",
    shx: "catalog:",
  });

  // Match oxfmt: alphabetise dependency sections (no-op on absent sections).
  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
