// Block-level (orchestrator) `package.json` content rules.
// Workspace-scope deps reflect ctx.modules at run time — see
// content-rules.md § "block/package.json (workspace-scope deps)".

import {
  ensureField,
  ensureDep,
  ensureWorkspaceScopeDeps,
  ensureWorkspaceScopeDevDeps,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function blockPackageJsonRules(): void {
  ensureField("type", "module");
  ensureField("files", ["index.d.ts", "index.js"]);

  // Workspace-scope: one entry per discovered module in the named scope.
  // Zero-module scopes contribute nothing.
  ensureWorkspaceScopeDeps("model");
  ensureWorkspaceScopeDeps("ui");
  ensureWorkspaceScopeDeps("workflow");
  ensureWorkspaceScopeDevDeps("test");
  ensureWorkspaceScopeDeps("software");

  ensureDep("@platforma-sdk/block-tools", "catalog:");

  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
