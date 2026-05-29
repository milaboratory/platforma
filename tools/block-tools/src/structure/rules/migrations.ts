// Migrations + legacy cleanup live here.
//
// Two patterns coexist (see dsl-example.md § "Compound Migration With
// Folder Rename + Package Update" and § "Legacy-Cleanup Pattern Inside
// `migrations.ts`"):
//
// 1. One-shot migrations gated on filesystem state. Folder renames,
//    cross-cutting one-time transforms. Use `when(pathExists/pathMissing)`
//    to ensure the migration fires once and becomes idempotent on
//    subsequent runs.
//
// 2. Legacy cleanup primitives. Unconditional `removeScript`,
//    `removeDep`, `remove(path)` calls naming artefacts the canonical
//    layout never produces. Idempotent by definition (no-op on absent
//    keys/paths). Each line is a one-way decision once shipped — every
//    block converges.
//
// The legacyCleanup() function below is the home for cleanup rules;
// step 5b experiments grow the rule set against real external blocks.

import {
  scope,
  remove,
  managed,
  generate,
  removeScript,
  removeDep,
  blockVars,
} from "../engine/api";
import { rootPackageJsonInitial } from "../templates/generated/root-package-json";

export function testFrameworkMigration(): void {
  // No active rename-bearing migration in v1. Hold for the test
  // framework rollout (see spec § "Goals" point 7).
}

// Unconditional legacy-cleanup rules. Each is a no-op on an
// already-canonical block (remove on an absent path, removeScript /
// removeDep on an absent key) and idempotent, so they sit at top level
// with no `when` gate. Grown against the step-5b experiment blocks; the
// trailing comment on each line names the block(s) it was discovered on.
//
// Root-scope cleanup is skipped for `--sdk-internal` blocks (no root
// module in that mode), so it never touches in-monorepo blocks.
export function legacyCleanup(): void {
  // eslint → oxlint: the canonical layout ships `.oxlintrc.json` /
  // `.oxfmtrc.json`; flat eslint configs are retired.
  scope("model", () => {
    remove("eslint.config.mjs"); // samples-and-data, mixcr-clonotyping, clonotype-clustering, antibody-sequence-liabilities
    remove("vite.config.mts"); // samples-and-data (vite build → ts-builder)
  });
  scope("ui", () => {
    remove("eslint.config.mjs"); // samples-and-data, mixcr-clonotyping, clonotype-clustering, antibody-sequence-liabilities
    remove("vite.config.ts"); // samples-and-data (vite build → ts-builder)
    remove("tsconfig.app.json"); // samples-and-data (vite-era split tsconfig)
    remove("tsconfig.node.json"); // samples-and-data (vite-era split tsconfig)
  });
  scope("test", () => {
    remove("eslint.config.mjs"); // all 5 experiment blocks
  });

  // Root-scope cleanup. The second `managed("package.json")` body
  // composes after rootRules (dsl-example.md § "Legacy-Cleanup Pattern").
  scope("root", () => {
    remove(".prettierrc"); // samples-and-data, sequence-properties (prettier → oxfmt)
    managed(
      "package.json",
      generate(() => rootPackageJsonInitial(blockVars())),
      () => {
        removeScript("pretty"); // samples-and-data (prettier-era)
        removeScript("build:dev"); // all 5 (PL_PKG_DEV dev-only helper, not canonical)
        removeScript("lint"); // mixcr-clonotyping, clonotype-clustering, antibody-sequence-liabilities (→ `check` via oxlint)
        removeScript("type-check"); // mixcr-clonotyping, clonotype-clustering, antibody-sequence-liabilities (→ `check` via ts-builder)
        removeScript("test:dry-run"); // all 5 (turbo dry-run helper, not canonical)
        removeScript("mark-stable"); // all 5 (not canonical)
        removeDep("@platforma-sdk/blocks-deps-updater"); // samples-and-data (merged into block-tools)
      },
    );
  });
}
