// Initial block-level (orchestrator) `package.json` — full canonical
// content (Path A). Workspace-scope deps reflect ctx.modules at run
// time; the generator pre-computes them so body rules are pure
// drift-correctors (templates-strategy.md § "Generator Form In Use").

import type { BlockVars } from "../../engine/api";
import { tryGetActiveRunContext } from "../../engine/builders";

export function blockPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  const ctx = tryGetActiveRunContext();
  const deps: Record<string, string> = {};
  // The block (facade) depends on its model / ui / workflow / software
  // modules — NOT on its test module. The test package depends on the
  // block (the `this-block` self-test alias); a reciprocal block→test
  // dep would be a pnpm/turbo cycle. Dependency flows test → block only.
  for (const m of ctx?.modules ?? []) {
    if (
      m.scope === "model" ||
      m.scope === "ui" ||
      m.scope === "workflow" ||
      m.scope === "software"
    ) {
      deps[m.name] = "workspace:*";
    }
  }
  return {
    name: `${v.facadeName}.block`,
    version: "1.0.0",
    // No `type: "module"`: the block facade's index.js is CommonJS (the
    // dev-block descriptor the middle layer loads). ESM would break it.
    files: ["index.d.ts", "index.js"],
    // shx rm -rf (not bare rm -rf) for cross-platform robustness (c8).
    scripts: { build: "shx rm -rf ./block-pack && block-tools pack" },
    dependencies: deps,
    // block-tools is a build-time CLI (block pack) → devDependencies,
    // matching every production block. shx powers the build script above.
    devDependencies: { "@platforma-sdk/block-tools": "sdk:", shx: "catalog:" },
  };
}
