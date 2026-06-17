// Retired toolchain dependencies — a SINGLE source of truth.
//
// These packages are superseded by the canonical toolchain (ts-builder owns
// the build, vue-tsc, and the vite plugins; oxlint/oxfmt replace eslint) and
// must be shed from a migrated block in BOTH places at once:
//   - the root catalog          → `ensureCatalogAbsent` (root-pnpm-workspace)
//   - every package.json scope  → `removeDep` (via removeRetiredToolchainDeps)
//
// Removing from only one side is a latent bug: a catalog entry dropped while a
// package still references `<dep>: "catalog:"` leaves a dangling reference that
// breaks `pnpm install`. Driving both from this one list makes that impossible
// — add (or un-retire) a dependency HERE, once.
//
// Per-entry rationale:
//   vite / tsup          — bundling now goes through ts-builder + rolldown.
//   vue-tsc              — ts-builder runs vue-tsc internally for `block-ui`; a
//                          direct dep resolves a different version than the
//                          toolchain pins, causing type clashes in main.ts.
//   @vitejs/plugin-vue   — bundled by ts-builder's internal vite config.
//   vite-plugin-dts      — .d.ts emit is handled by ts-builder.
//   @platforma-sdk/eslint-config — eslint is retired; linting runs via oxlint
//                          inside `ts-builder check`.

import { removeDep } from "../../engine/api";

export const RETIRED_TOOLCHAIN_DEPS: readonly string[] = [
  "vite",
  "tsup",
  "vue-tsc",
  "@vitejs/plugin-vue",
  "vite-plugin-dts",
  "@platforma-sdk/eslint-config",
];

/** Drop every retired toolchain dep from the current package.json scope.
 *  Idempotent (a `removeDep` on an absent key is a no-op), so it is safe to
 *  call uniformly from every package.json rules body regardless of which deps
 *  a given scope ever carried. Pairs with the catalog-side removal in
 *  `rootPnpmWorkspaceRules`. */
export function removeRetiredToolchainDeps(): void {
  for (const name of RETIRED_TOOLCHAIN_DEPS) removeDep(name);
}
