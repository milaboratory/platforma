// Workflow `package.json` content rules.
// Workflow packages reference software modules at workspace level when
// the block has any (ensureWorkspaceScopeDeps("software")).

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDeps,
  ensureWorkspaceScopeDeps,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function workflowPackageJsonRules(): void {
  ensureField("type", "module");

  // No `fmt`: the workflow is Tengo, not TS (nothing for ts-builder/oxlint to
  // process). Build + check go through pl-tengo. See the linter side-quest.
  ensureScript("build", "rm -rf dist && pl-tengo build");
  ensureScript("check", "pl-tengo check");
  ensureScript("test", "vitest run");

  ensureDep("@platforma-sdk/workflow-tengo", "sdk:");

  // Pulls in every block-local software module as a workspace dep so
  // the workflow can reference the produced runenv assets.
  ensureWorkspaceScopeDeps("software");

  ensureDevDeps({
    "@platforma-sdk/tengo-builder": "sdk:",
    vitest: "catalog:",
  });

  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
