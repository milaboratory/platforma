// Initial workflow `package.json`. Workspace software deps are filled from
// the discovered modules; the generator carries the canonical base shape.

import type { BlockVars } from "../../engine/api";
import { getActiveRunContext } from "../../engine/builders";

export function workflowPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  const ctx = getActiveRunContext();
  const softwareDeps: Record<string, string> = {};
  for (const m of ctx.modules) {
    if (m.scope === "software") softwareDeps[m.name] = "workspace:*";
  }
  return {
    name: `${v.facadeName}.workflow`,
    version: "1.0.0",
    type: "module",
    scripts: {
      // No `fmt`: the workflow is Tengo, not TS — nothing for oxlint/oxfmt
      // to process. Tengo is built and checked by pl-tengo.
      build: "shx rm -rf dist && pl-tengo build",
      check: "pl-tengo check",
      test: "vitest run --passWithNoTests",
      // Tengo source formatter (emacs batch). Falls back to a notice when
      // emacs is absent, so the script never hard-fails the environment.
      format: "/usr/bin/env emacs --script ./format.el || echo 'No emacs.'",
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
