// Initial workflow `package.json` — full canonical content (Path A).
// ensureWorkspaceScopeDeps("software") in the body fills in workspace
// software deps based on discovered modules — generator carries the
// canonical "base" shape; body adds workspace deps reflecting actual
// software modules.

import type { BlockVars } from "../../engine/api";
import { tryGetActiveRunContext } from "../../engine/builders";

export function workflowPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  const ctx = tryGetActiveRunContext();
  const softwareDeps: Record<string, string> = {};
  for (const m of ctx?.modules ?? []) {
    if (m.scope === "software") softwareDeps[m.name] = "workspace:*";
  }
  return {
    name: `${v.facadeName}.workflow`,
    version: "1.0.0",
    type: "module",
    scripts: {
      fmt: "ts-builder format",
      build: "tengo-builder build",
      check: "ts-builder check --target block-workflow",
      test: "vitest run",
    },
    dependencies: {
      "@platforma-sdk/workflow-tengo": "catalog:",
      ...softwareDeps,
    },
    peerDependencies: {
      "@types/node": "*",
      typescript: "*",
    },
    devDependencies: {
      "@milaboratories/ts-builder": "catalog:",
      "@milaboratories/ts-configs": "catalog:",
      "@platforma-sdk/block-tools": "catalog:",
      "@platforma-sdk/tengo-builder": "catalog:",
      vitest: "catalog:",
    },
  };
}
