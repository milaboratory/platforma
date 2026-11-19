// Root `.changeset/config.json`. CI runs `pnpm run version-packages`
// (`changeset version`) on every PR and sets `require-package-path-bump`, so a
// block without this file fails its first CI run with "There is no .changeset
// folder".
//
// Managed, not fixed: `$schema` is whatever `changeset init` last wrote (seven
// versions are in use across the blocks) and `fixed`/`linked`/`ignore` are
// author-owned lists. Only the fields CI depends on are re-asserted, plus the
// block's own `fixed` group.

import {
  ensureField,
  enforceFieldOrder,
  transformAt,
  type RunContext,
  type Scope,
} from "../engine/api";
import { findModules } from "../engine/ctx";

/** Seeded so the scaffold's own PR passes the `require-package-path-bump` gate
 *  without bumping: `changeset version` consumes it and leaves the facade at
 *  `INITIAL_MODULE_VERSION`, so the first version a user sees is 1.0.0 rather
 *  than 1.0.1. Seeded (not managed) — a refresh must never resurrect it once
 *  the first release has consumed it. */
export const EMPTY_CHANGESET_SEED = `---
---

Initial release.
`;

export function rootChangesetConfigInitial(ctx: RunContext): Record<string, unknown> {
  return {
    $schema: "https://unpkg.com/@changesets/config@3.1.1/schema.json",
    changelog: CHANGELOG,
    commit: false,
    fixed: [blockFixedGroup(ctx)],
    linked: [],
    access: ACCESS,
    baseBranch: BASE_BRANCH,
    updateInternalDependencies: UPDATE_INTERNAL_DEPENDENCIES,
    ignore: [],
  };
}

export function rootChangesetConfigRules(ctx: RunContext): void {
  ensureField("changelog", CHANGELOG);
  ensureField("commit", false);
  ensureField("access", ACCESS);
  ensureField("baseBranch", BASE_BRANCH);
  ensureField("updateInternalDependencies", UPDATE_INTERNAL_DEPENDENCIES);
  const group = blockFixedGroup(ctx);
  transformAt<unknown>("fixed", (current) => withFixedGroup(current, group));
  enforceFieldOrder(FIELD_ORDER);
}

// Internals

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

/** Packages released under one version. The facade lists its siblings only as
 *  devDependencies, and changesets never bumps a package for a devDependency
 *  release — without this group a model/ui/workflow change ships no new block.
 *  The kind and software stay out: they are runtime dependencies of the model
 *  and the workflow, so their bumps already reach the group. */
const FIXED_SCOPES: Scope[] = ["block", "model", "ui", "workflow"];

function blockFixedGroup(ctx: RunContext): string[] {
  return FIXED_SCOPES.flatMap((scope) => findModules(ctx, scope).map((m) => m.name));
}

/** Merges `group` into the first author group that shares a package with it,
 *  keeping that group's extra packages after the block's own; drops the
 *  block's packages from every other group, since changesets rejects a package
 *  listed in two fixed groups. Appends `group` when no author group overlaps. */
function withFixedGroup(current: unknown, group: string[]): string[][] {
  const owned = new Set(group);
  const groups = Array.isArray(current) ? current.filter(isStringArray) : [];
  const hostIndex = groups.findIndex((g) => g.some((name) => owned.has(name)));
  const result: string[][] = [];
  groups.forEach((g, i) => {
    const extras = g.filter((name) => !owned.has(name));
    if (i === hostIndex) result.push([...group, ...extras]);
    else if (extras.length > 0) result.push(extras);
  });
  if (hostIndex === -1) result.push(group);
  return result;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}
