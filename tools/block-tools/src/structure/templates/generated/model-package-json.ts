// Initial model `package.json` — see rules/model-package-json.ts.

import type { BlockVars } from "../../engine/api";

export function modelPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.model`,
    version: "1.0.0",
  };
}
