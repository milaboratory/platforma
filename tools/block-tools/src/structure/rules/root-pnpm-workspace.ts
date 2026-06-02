// Root `pnpm-workspace.yaml`: the catalog membership, the initial generator,
// and the drift-correcting body rules, co-located.
//
// The catalog is split in two:
//   - SDK packages: `SDK_CATALOG_PACKAGES` is a list of package NAMES (catalog
//     membership only — no versions). On init the `onInitOrUpdate` frame fetches
//     npm latest for each (init requires network) and writes it; the keys must
//     exist in the catalog first for that in-place bump to land, so the initial
//     generator seeds them with an obviously-invalid placeholder that the bump
//     always overwrites. No version is stored here and there is no fallback.
//   - infra / tooling: a `~`-floored set we control deliberately. No rule
//     ever fetches these — refresh leaves them untouched and update-deps
//     does not match them. Bump the floor here when authoring the scaffold.
//
// Default refresh is purely structural: it verifies the workspace
// `packages:` list matches the discovered modules and leaves every catalog
// version exactly as the author/lockfile has it. Version resolution (writing
// npm-latest for the SDK families) lives in the separate `onInitOrUpdate`
// frame (`rootCatalogBumpRules`), which fires on init + update-deps only.

import { ensureWorkspaceModulePaths, type RunContext } from "../engine/api";
import { matchesBumpPattern } from "../engine/registry-client";

/** SDK packages that live in the catalog (membership only — no versions).
 *  Init fetches npm latest for each; refresh leaves them as the lockfile has
 *  them. */
export const SDK_CATALOG_PACKAGES: readonly string[] = [
  "@platforma-sdk/model",
  "@platforma-sdk/ui-vue",
  "@platforma-sdk/workflow-tengo",
  "@platforma-sdk/test",
  "@platforma-sdk/block-tools",
  "@platforma-sdk/tengo-builder",
  "@platforma-sdk/package-builder",
  "@milaboratories/ts-builder",
  "@milaboratories/ts-configs",
];

/** Init-only catalog seed for every SDK package: an obviously-invalid version
 *  the `onInitOrUpdate` bump always overwrites with npm latest. It exists only
 *  so the catalog key is present for that in-place bump. It is never a
 *  fallback — a real init requires network and overwrites it; were it ever to
 *  reach a lockfile, `pnpm install` fails loudly on the unresolvable version. */
const SDK_CATALOG_INIT_PLACEHOLDER = "0.0.0-init-must-fetch";

// Invariant: every SDK package must be fetched on init (match a bump pattern),
// or its placeholder would ship un-resolved. Caught at load time.
for (const name of SDK_CATALOG_PACKAGES) {
  if (!matchesBumpPattern(name)) {
    throw new Error(
      `SDK_CATALOG_PACKAGES entry '${name}' matches no catalog bump pattern; ` +
        `its placeholder would never be resolved to npm latest on init. ` +
        `Add it to CATALOG_BUMP_PATTERNS or move it to the infra floor.`,
    );
  }
}

/** Infra / tooling — a `~`-floored curated set. Not exact-pinned on refresh
 *  and not bumped by update-deps. */
export const INFRA_CATALOG_FLOOR: Record<string, string> = {
  turbo: "~2.8.11",
  shx: "~0.4.0",
  "@changesets/cli": "~2.29.8",
  vitest: "~4.0.18",
  // The seeded ui depends on `vue` (catalog:). `@platforma-sdk/ui-vue` pins
  // vue as an EXACT regular dependency (not a peer), so the block must pin the
  // SAME exact version — a floated `~` lets the ui resolve a newer 3.5.x than
  // ui-vue's, yielding two vue instances and a SdkPluginV3-vs-Plugin type
  // clash in `main.ts`. Keep this in lockstep with ui-vue's vue pin.
  vue: "3.5.24",
};

/** Catalog name of the python runenv. Added to a block's catalog only when
 *  the block carries a software module. Pinned to an EXACT version — updating
 *  the python runenv is an explicit author decision, never automatic. */
export const RUNENV_PYTHON = "@platforma-open/milaboratories.runenv-python-3";
const RUNENV_PYTHON_VERSION = "1.8.2";

export function rootPnpmWorkspaceInitial(ctx: RunContext): Record<string, unknown> {
  // Non-root module paths only. The block root ("") is discovered
  // implicitly and must never be written as a "." entry — listing it breaks
  // turbo's task graph. Root stays in ctx.modules for rule fan-out.
  const paths = ctx.modules
    .filter((m) => m.path !== "")
    .map((m) => m.path)
    .sort();
  // SDK packages first (placeholder, overwritten by the init bump), then the
  // infra floor — matching the order the catalog is written.
  const catalog: Record<string, string> = {};
  for (const name of SDK_CATALOG_PACKAGES) catalog[name] = SDK_CATALOG_INIT_PLACEHOLDER;
  Object.assign(catalog, INFRA_CATALOG_FLOOR);
  if (ctx.modules.some((m) => m.scope === "software")) {
    catalog[RUNENV_PYTHON] = RUNENV_PYTHON_VERSION;
  }
  return {
    packages: paths,
    catalog,
  };
}

export function rootPnpmWorkspaceRules(): void {
  ensureWorkspaceModulePaths();
}
