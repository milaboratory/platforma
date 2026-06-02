// Initial test `package.json` — full canonical content (Path A).

import type { BlockVars } from "../../engine/api";

export function testPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.test`,
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      test: "vitest run",
    },
    dependencies: {
      "@platforma-sdk/test": "catalog:",
    },
    peerDependencies: {
      "@types/node": "*",
      typescript: "*",
    },
    devDependencies: {
      "@milaboratories/ts-builder": "catalog:",
      "@milaboratories/ts-configs": "catalog:",
      vitest: "catalog:",
    },
  };
}
