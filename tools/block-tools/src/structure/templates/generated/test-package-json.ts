// Initial test `package.json` — see rules/test-package-json.ts.

import type { BlockVars } from "../../engine/api";

export function testPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.test`,
    version: "1.0.0",
    private: true,
  };
}
