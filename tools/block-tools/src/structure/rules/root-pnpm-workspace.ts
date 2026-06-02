// Root `pnpm-workspace.yaml` content rules.
// Verifies workspace `packages:` list matches discovered modules and
// catalog pins are exact-version (strips `^` / `~`). Network-bumping
// (`bumpCatalogToLatest`) lives behind a separate `onUpdateDeps` frame
// at the structure level — not invoked from this body.

import { ensureWorkspaceModulePaths, ensureCatalogPin } from "../engine/api";
import { SDK_CATALOG_PINS } from "../templates/generated/root-pnpm-workspace";

export function rootPnpmWorkspaceRules(): void {
  ensureWorkspaceModulePaths();

  // see templates/generated/root-pnpm-workspace.ts:SDK_CATALOG_PINS — the
  // shared source of truth for which catalog entries are SDK-pinned.
  for (const name of Object.keys(SDK_CATALOG_PINS)) {
    ensureCatalogPin(name);
  }
}
