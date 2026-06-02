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
      // No `fmt` (ts-builder format): the workflow is Tengo, not TS — there is
      // nothing for oxlint/oxfmt to process (and it currently crashes on a
      // ts-builder config-path bug for oxlintrc-less packages — see the linter
      // side-quest). Tengo is built/checked by pl-tengo.
      // shx rm -rf (not bare rm -rf) for cross-platform robustness (c8).
      build: "shx rm -rf dist && pl-tengo build",
      check: "pl-tengo check",
      test: "vitest run --passWithNoTests",
    },
    dependencies: {
      "@platforma-sdk/workflow-tengo": "sdk:",
      ...softwareDeps,
    },
    devDependencies: {
      "@platforma-sdk/tengo-builder": "sdk:",
      "@platforma-sdk/test": "sdk:",
      vitest: "catalog:",
      shx: "catalog:",
    },
  };
}
