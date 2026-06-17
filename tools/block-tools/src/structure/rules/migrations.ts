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
// with no `when` gate.
//
// Root-scope cleanup is skipped for `--sdk-internal` blocks (no root
// module in that mode), so it never touches in-monorepo blocks.
export function legacyCleanup(): void {
  // Retired per-scope config files: flat eslint configs and vite-era build /
  // split-tsconfig files, replaced by the oxlint/oxfmt + ts-builder layout.
  scope("model", () => {
    remove("eslint.config.mjs");
    remove("vite.config.mts");
  });
  scope("ui", () => {
    remove("eslint.config.mjs");
    remove("vite.config.ts");
    remove("tsconfig.app.json");
    remove("tsconfig.node.json");
  });
  scope("test", () => {
    remove("eslint.config.mjs");
  });

  // Root-scope cleanup. The second `managed("package.json")` body composes
  // after rootRules.
  scope("root", () => {
    remove(".prettierrc");
    managed(
      "package.json",
      generate(() => rootPackageJsonInitial(getActiveRunContext())),
      () => {
        // `pretty` (prettier) is superseded by `fmt` (oxfmt); the standalone
        // deps-updater is now part of block-tools.
        removeScript("pretty");
        removeDep("@platforma-sdk/blocks-deps-updater");
      },
    );
  });
}
