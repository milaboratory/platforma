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
    private: true,
    type: "module",
    scripts: {
      fmt: "ts-builder format",
      // `ts-builder check` runs type-check + lint (oxlint) + fmt-check (oxfmt).
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
  // Controlled sibling — workspace-only, never published. (The initial already
  // seeds `private: true`; the body re-asserts it. The `version` is kept —
  // changesets-owned — so the packed template's lib carries a version.)
  ensureField("private", true);

  ensureField("type", "module");

  ensureScript("fmt", "ts-builder format");
  // `ts-builder check` runs type-check + lint (oxlint) + fmt-check (oxfmt).
  ensureScript("check", "ts-builder check --target block-test");
  ensureScript("test", "vitest run --passWithNoTests");
  // Linting runs inside `ts-builder check` — no separate `lint` script.
  removeScript("lint");

  ensureDevDeps({
    "@platforma-sdk/test": "sdk:",
    "@milaboratories/ts-builder": "sdk:",
    "@milaboratories/ts-configs": "sdk:",
    vitest: "catalog:",
  });

  // The test tsconfig (@milaboratories/ts-configs/block/test) supplies the
  // ambient types, so only the `typescript` peer is needed — no `@types/node`.
  ensurePeerDeps({
    typescript: "*",
  });
  removeDep("@types/node");
  removeRetiredToolchainDeps();

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
