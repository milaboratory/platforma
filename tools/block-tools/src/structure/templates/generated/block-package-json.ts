// Initial block-level `package.json` — see rules/block-package-json.ts.

import type { BlockVars } from "../../engine/api";

export function blockPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.block`,
    version: "1.0.0",
  };
}
