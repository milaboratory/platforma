// Initial UI `package.json` — see rules/ui-package-json.ts.

import type { BlockVars } from "../../engine/api";

export function uiPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.ui`,
    version: "1.0.0",
  };
}
