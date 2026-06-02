// Initial block-level (orchestrator) `package.json` — full canonical
// content (Path A). Workspace-scope deps reflect ctx.modules at run
// time; the generator pre-computes them so body rules are pure
// drift-correctors (templates-strategy.md § "Generator Form In Use").

import type { BlockVars } from "../../engine/api";
import { tryGetActiveRunContext } from "../../engine/builders";

export function blockPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  const ctx = tryGetActiveRunContext();
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {};
  for (const m of ctx?.modules ?? []) {
    if (
      m.scope === "model" ||
      m.scope === "ui" ||
      m.scope === "workflow" ||
      m.scope === "software"
    ) {
      deps[m.name] = "workspace:*";
    } else if (m.scope === "test") {
      devDeps[m.name] = "workspace:*";
    }
  }
  deps["@platforma-sdk/block-tools"] = "catalog:";
  return {
    name: `${v.facadeName}.block`,
    version: "1.0.0",
    type: "module",
    files: ["index.d.ts", "index.js"],
    dependencies: deps,
    devDependencies: devDeps,
  };
}
