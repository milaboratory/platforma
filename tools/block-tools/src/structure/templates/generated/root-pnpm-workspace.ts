// Initial `pnpm-workspace.yaml`. The `packages:` list is seeded from the
// discovered modules. The catalog is split in two:
//   - SDK packages: this map's KEYS define which SDK packages live in the
//     catalog; the version strings are only the init-time SEED. On init the
//     `onInitOrUpdate` frame overwrites them with npm latest (init requires
//     network), so the seed values never survive a real init. They exist
//     only as the pre-fetch placeholder and a sane fallback.
//   - infra / tooling: a `~`-floored set we control deliberately. No rule
//     ever fetches these — refresh leaves them untouched and update-deps
//     does not match them. Bump the floor here when authoring the scaffold.

import { getActiveRunContext } from "../../engine/builders";
import { matchesBumpPattern } from "../../engine/registry-client";

/** SDK packages. Keys = catalog membership; values = init-time seed,
 *  overwritten by the npm-latest fetch in the `onInitOrUpdate` frame. */
export const SDK_CATALOG_PINS: Record<string, string> = {
  "@platforma-sdk/model": "1.64.0",
  "@platforma-sdk/ui-vue": "1.64.0",
  "@platforma-sdk/workflow-tengo": "5.13.1",
  "@platforma-sdk/test": "1.64.0",
  "@platforma-sdk/block-tools": "2.7.7",
  "@platforma-sdk/tengo-builder": "2.5.8",
  "@platforma-sdk/package-builder": "3.12.0",
  "@milaboratories/ts-builder": "1.3.1",
  "@milaboratories/ts-configs": "1.2.3",
};

// Invariant: every SDK pin must be fetched on init (match a bump pattern),
// or its seed value would silently ship un-resolved. Caught at load time.
for (const name of Object.keys(SDK_CATALOG_PINS)) {
  if (!matchesBumpPattern(name)) {
    throw new Error(
      `SDK_CATALOG_PINS entry '${name}' matches no catalog bump pattern; ` +
        `its seed version would never be resolved to npm latest on init. ` +
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
 *  the block carries a software module. `~`-floored like the rest of the
 *  infra set. */
export const RUNENV_PYTHON = "@platforma-open/milaboratories.runenv-python-3";
const RUNENV_PYTHON_FLOOR = "~1.8.2";

export function rootPnpmWorkspaceInitial(): Record<string, unknown> {
  const ctx = getActiveRunContext();
  // Non-root module paths only. The block root ("") is discovered
  // implicitly and must never be written as a "." entry — listing it breaks
  // turbo's task graph. Root stays in ctx.modules for rule fan-out.
  const paths = ctx.modules
    .filter((m) => m.path !== "")
    .map((m) => m.path)
    .sort();
  const catalog: Record<string, string> = { ...SDK_CATALOG_PINS, ...INFRA_CATALOG_FLOOR };
  if (ctx.modules.some((m) => m.scope === "software")) {
    catalog[RUNENV_PYTHON] = RUNENV_PYTHON_FLOOR;
  }
  return {
    packages: paths,
    catalog,
  };
}
