// Workflow `package.json` content rules.
// Workflow packages reference software modules at workspace level when
// the block has any (ensureWorkspaceScopeDeps("software")).

import {
  ensureField,
  ensureScript,
  ensureDep,
  ensureDevDeps,
  ensurePeerDeps,
  ensureWorkspaceScopeDeps,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function workflowPackageJsonRules(): void {
  ensureField("type", "module");

  ensureScript("fmt", "ts-builder format");
  ensureScript("build", "tengo-builder build");
  ensureScript("check", "ts-builder check --target block-workflow");
  ensureScript("test", "vitest run");

  ensureDep("@platforma-sdk/workflow-tengo", "catalog:");

  // Pulls in every block-local software module as a workspace dep so
  // the workflow can reference the produced runenv assets.
  ensureWorkspaceScopeDeps("software");

  ensureDevDeps({
    "@milaboratories/ts-builder": "catalog:",
    "@milaboratories/ts-configs": "catalog:",
    "@platforma-sdk/block-tools": "catalog:",
    "@platforma-sdk/tengo-builder": "catalog:",
    vitest: "catalog:",
  });

  ensurePeerDeps({
    "@types/node": "*",
    typescript: "*",
  });

  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
