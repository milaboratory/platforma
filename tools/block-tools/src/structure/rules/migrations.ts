// Migrations + legacy cleanup live here.
//
// Two patterns coexist:
//
// 1. One-shot migrations gated on filesystem state. Folder renames,
//    cross-cutting one-time transforms. Use `when(pathExists/pathMissing)`
//    so the migration fires once and is idempotent on subsequent runs.
//
// 2. Legacy cleanup primitives. Unconditional `removeScript`,
//    `removeDep`, `remove(path)` calls naming artefacts the canonical
//    layout never produces. Idempotent by definition (no-op on absent
//    keys/paths). Each line is a one-way decision: every block converges.

import { scope, remove, managed, generate, removeScript, removeDep } from "../engine/api";
import { getActiveRunContext } from "../engine/builders";
import { rootPackageJsonInitial } from "./root-package-json";

export function testFrameworkMigration(): void {
  // No active rename-bearing migration yet. Reserved for the test
  // framework rollout.
}

// Unconditional legacy-cleanup rules. Each is a no-op on an
// already-canonical block (remove on an absent path, removeScript /
// removeDep on an absent key) and idempotent, so they sit at top level
// with no `when` gate. The trailing comment on each line names the real
// block(s) that carry the artefact being cleaned.
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

  // Root-scope cleanup. The second `managed("package.json")` body composes
  // after rootRules.
  scope("root", () => {
    remove(".prettierrc"); // samples-and-data, sequence-properties (prettier → oxfmt)
    managed(
      "package.json",
      generate(() => rootPackageJsonInitial(getActiveRunContext())),
      () => {
        // `pretty` (prettier) is superseded by the canonical `fmt` (oxfmt);
        // the standalone deps-updater was merged into block-tools.
        removeScript("pretty"); // samples-and-data
        removeDep("@platforma-sdk/blocks-deps-updater"); // samples-and-data
      },
    );
  });
}
