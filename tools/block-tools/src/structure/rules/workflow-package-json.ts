// Workflow `package.json` content rules. Workflow packages reference
// software modules at workspace level when the block has any.

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
