// Initial test `package.json`.

import type { BlockVars } from "../../engine/api";

export function testPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: `${v.facadeName}.test`,
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      // Type-only check (no oxlint/oxfmt — the test scope ships no lint/fmt
      // config). Slots into the turbo `check` task.
      check: "ts-builder type-check --target block-test",
      test: "vitest run --passWithNoTests",
    },
    peerDependencies: {
      typescript: "*",
    },
    devDependencies: {
      "@platforma-sdk/test": "sdk:",
      "@milaboratories/ts-builder": "sdk:",
      "@milaboratories/ts-configs": "sdk:",
      vitest: "catalog:",
    },
  };
}
