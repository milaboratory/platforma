// Initial block-level (orchestrator) `package.json`. Workspace-scope deps
// reflect the discovered modules at run time; the generator pre-computes
// them so the body rules are pure drift-correctors.

import type { BlockVars } from "../../engine/api";
import { getActiveRunContext } from "../../engine/builders";

export function blockPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  const ctx = getActiveRunContext();
  const deps: Record<string, string> = {};
  // The facade depends on its model / ui / workflow modules — not on its
  // software module (the workflow owns that dep) and not on its test module
  // (the test package depends on the facade, so a reciprocal dep would be a
  // pnpm/turbo cycle).
  for (const m of ctx.modules) {
    if (m.scope === "model" || m.scope === "ui" || m.scope === "workflow") {
      deps[m.name] = "workspace:*";
    }
  }
  return {
    name: `${v.facadeName}.block`,
    version: "1.0.0",
    // type:"module" intentionally omitted.
    files: ["index.d.ts", "index.js"],
    scripts: {
      build: "shx rm -rf ./block-pack && block-tools pack",
      "mark-stable":
        "block-tools mark-stable -r 's3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1'",
      prepublishOnly:
        "block-tools pack && block-tools publish -r 's3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1'",
      "do-pack": "shx rm -f *.tgz && block-tools pack && pnpm pack && shx mv *.tgz package.tgz",
    },
    dependencies: deps,
    devDependencies: { "@platforma-sdk/block-tools": "sdk:", shx: "catalog:" },
  };
}
