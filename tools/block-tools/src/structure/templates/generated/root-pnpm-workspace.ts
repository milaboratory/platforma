// Initial `pnpm-workspace.yaml`. The `packages:` list is seeded from the
// discovered modules. The catalog is split in two:
//   - SDK packages: exact pins (a curated floor that init writes and
//     `refresh --update-deps-only` later bumps to npm latest). Refresh keeps
//     them exact.
//   - infra / tooling: a `~`-floored set we control deliberately. Refresh
//     leaves these untouched and update-deps does not bump them; bump the
//     floor here when authoring the scaffold.

import { getActiveRunContext } from "../../engine/builders";

/** SDK packages — exact pins, kept exact by `ensureCatalogPin` on refresh
 *  and bumped to npm latest by `update-deps`. */
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

/** Infra / tooling — a `~`-floored curated set. Not exact-pinned on refresh
 *  and not bumped by update-deps. */
export const INFRA_CATALOG_FLOOR: Record<string, string> = {
  turbo: "~2.8.11",
  shx: "~0.4.0",
  "@changesets/cli": "~2.29.8",
  vitest: "~4.0.18",
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
