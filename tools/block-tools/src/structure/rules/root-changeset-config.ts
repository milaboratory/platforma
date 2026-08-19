// Root `.changeset/config.json`. CI runs `pnpm run version-packages`
// (`changeset version`) on every PR and sets `require-package-path-bump`, so a
// block without this file fails its first CI run with "There is no .changeset
// folder".
//
// Managed, not fixed: `$schema` is whatever `changeset init` last wrote (seven
// versions are in use across the blocks) and `fixed`/`linked`/`ignore` are
// author-owned lists. Only the fields CI depends on are re-asserted.

import { ensureField, enforceFieldOrder } from "../engine/api";

/** Seeded so the scaffold's own PR passes the `require-package-path-bump` gate
 *  without bumping: `changeset version` consumes it and leaves the facade at
 *  `INITIAL_MODULE_VERSION`, so the first version a user sees is 1.0.0 rather
 *  than 1.0.1. Seeded (not managed) — a refresh must never resurrect it once
 *  the first release has consumed it. */
export const EMPTY_CHANGESET_SEED = `---
---

Initial release.
`;

const CHANGELOG = "@changesets/cli/changelog";
const ACCESS = "restricted";
const BASE_BRANCH = "main";
const UPDATE_INTERNAL_DEPENDENCIES = "patch";

const FIELD_ORDER = [
  "$schema",
  "changelog",
  "commit",
  "fixed",
  "linked",
  "access",
  "baseBranch",
  "updateInternalDependencies",
  "ignore",
];

export function rootChangesetConfigInitial(): Record<string, unknown> {
  return {
    $schema: "https://unpkg.com/@changesets/config@3.1.1/schema.json",
    changelog: CHANGELOG,
    commit: false,
    fixed: [],
    linked: [],
    access: ACCESS,
    baseBranch: BASE_BRANCH,
    updateInternalDependencies: UPDATE_INTERNAL_DEPENDENCIES,
    ignore: [],
  };
}

export function rootChangesetConfigRules(): void {
  ensureField("changelog", CHANGELOG);
  ensureField("commit", false);
  ensureField("access", ACCESS);
  ensureField("baseBranch", BASE_BRANCH);
  ensureField("updateInternalDependencies", UPDATE_INTERNAL_DEPENDENCIES);
  enforceFieldOrder(FIELD_ORDER);
}
