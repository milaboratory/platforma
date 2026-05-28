// Initial workflow `package.json` — see rules/workflow-package-json.ts.

import type { BlockVars } from "../../engine/api";

export function workflowPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.workflow`,
    version: "1.0.0",
  };
}
