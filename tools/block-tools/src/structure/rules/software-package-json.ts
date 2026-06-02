// Software `package.json` content rules. One body, N modules — fan-out
// is driven by `ctx.modules` (see dsl-example.md § "Multi-module fan-out").
// The `block-software` field stays opaque to the structurer at v1; rule
// authors needing domain-specific shape use `transformAt("block-software", ...)`.

import { ensureField, ensureScript, ensureDevDeps, enforceFieldOrder } from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function softwarePackageJsonRules(): void {
  ensureField("type", "module");

  ensureScript("build", "block-tools build-software");

  ensureDevDeps({
    "@milaboratories/ts-builder": "catalog:",
    "@platforma-sdk/block-tools": "catalog:",
    "@platforma-sdk/package-builder": "catalog:",
  });

  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
