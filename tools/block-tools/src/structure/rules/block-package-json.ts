// Block-level (orchestrator) `package.json` content rules.
// Workspace-scope deps reflect ctx.modules at run time — see
// content-rules.md § "block/package.json (workspace-scope deps)".

import {
  ensureField,
  ensureScript,
  ensureDevDep,
  ensureWorkspaceScopeDeps,
  enforceFieldOrder,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function blockPackageJsonRules(): void {
  // No `type: "module"`: the block facade's `index.js` is the CommonJS
  // dev-block descriptor (`blockSpec` via `require` + `__dirname`) that the
  // middle layer loads — ESM would break it. The block has no TS sources to
  // compile.
  ensureField("files", ["index.d.ts", "index.js"]);

  // Block build = pack the dev block. shx rm -rf (not bare rm -rf) for
  // cross-platform robustness, like the rest of the monorepo. (c8 — the
  // structurer now owns/normalizes this script.)
  ensureScript("build", "shx rm -rf ./block-pack && block-tools pack");

  // Workspace-scope: one entry per discovered module in the named scope.
  // Zero-module scopes contribute nothing. The block (facade) depends on
  // its model / ui / workflow / software modules — NOT on its test module:
  // the test package depends on the block (the `this-block` self-test
  // alias), so a reciprocal block→test dep would be a pnpm/turbo cycle.
  ensureWorkspaceScopeDeps("model");
  ensureWorkspaceScopeDeps("ui");
  ensureWorkspaceScopeDeps("workflow");
  ensureWorkspaceScopeDeps("software");

  // build-time CLI → devDependencies (matches production blocks).
  ensureDevDep("@platforma-sdk/block-tools", "sdk:");
  // shx for the cross-platform build script above. (c8)
  ensureDevDep("shx", "catalog:");

  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
