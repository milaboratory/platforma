// Test `package.json`: the initial generator and the drift-correcting body
// rules, co-located.

import {
  ensureField,
  ensureScript,
  ensureDevDeps,
  ensurePeerDeps,
  removeDep,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type RunContext,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";

export function testPackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
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

export function testPackageJsonRules(): void {
  ensureField("type", "module");

  // Type-only check (no oxlint/oxfmt — the test scope ships no lint/fmt
  // config); slots into the turbo `check` task.
  ensureScript("check", "ts-builder type-check --target block-test");
  ensureScript("test", "vitest run --passWithNoTests");

  // @platforma-sdk/test is a test-time dep → devDependencies (matches prod).
  ensureDevDeps({
    "@platforma-sdk/test": "sdk:",
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    vitest: "catalog:",
  });

  // The test tsconfig (@milaboratories/ts-configs/block/test) supplies the
  // ambient types; only the `typescript` peer is needed. Drop any stray
  // `@types/node` peer a legacy block declares.
  ensurePeerDeps({
    typescript: "*",
  });
  removeDep("@types/node");

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
