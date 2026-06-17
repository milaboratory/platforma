// Test `package.json`: the initial generator and the drift-correcting body
// rules, co-located.

import {
  ensureField,
  ensureScript,
  ensureDevDeps,
  ensurePeerDeps,
  removeDep,
  removeScript,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type RunContext,
} from "../engine/api";
import { canonicalPackageJsonOrder } from "./shared/key-order";
import { removeRetiredToolchainDeps } from "./shared/retired-deps";

export function testPackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
  return {
    name: `${v.facadeName}.test`,
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      fmt: "ts-builder format",
      // Full check — type-check + lint (oxlint) + fmt-check (oxfmt) — same as
      // model/ui, so test sources are gated identically. Slots into the turbo
      // `check` task.
      check: "ts-builder check --target block-test",
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

  // The test scope is formatted + lint/fmt-checked like model/ui: `fmt` runs
  // the oxlint/oxfmt fixer, `check` the type-check + lint + fmt-check.
  ensureScript("fmt", "ts-builder format");
  // Full check — type-check + lint (oxlint) + fmt-check (oxfmt) — same as
  // model/ui, so test sources are gated identically; slots into the turbo
  // `check` task.
  ensureScript("check", "ts-builder check --target block-test");
  ensureScript("test", "vitest run --passWithNoTests");
  // eslint → ts-builder/oxlint: the legacy `lint` script is an author leftover
  // (linting now runs inside `ts-builder check`). Drop it and its config dep.
  removeScript("lint");

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
  // Shed retired toolchain deps (eslint-config among them) — single source of
  // truth in shared/retired-deps; their catalog entries drop in lockstep via
  // rootPnpmWorkspaceRules.
  removeRetiredToolchainDeps();

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
