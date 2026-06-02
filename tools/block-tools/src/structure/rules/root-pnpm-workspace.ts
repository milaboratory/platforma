// Root `pnpm-workspace.yaml` content rules.
// Verifies workspace `packages:` list matches discovered modules and
// catalog pins are exact-version (strips `^` / `~`). Network-bumping
// (`bumpCatalogToLatest`) lives behind a separate `onUpdateDeps` frame
// at the structure level — not invoked from this body.

import { ensureWorkspaceModulePaths, ensureCatalogPin, when } from "../engine/api";
import { SDK_CATALOG_PINS, RUNENV_PYTHON } from "../templates/generated/root-pnpm-workspace";

export function rootPnpmWorkspaceRules(): void {
  ensureWorkspaceModulePaths();

  // see templates/generated/root-pnpm-workspace.ts:SDK_CATALOG_PINS — the
  // shared source of truth for which catalog entries are SDK-pinned.
  for (const name of Object.keys(SDK_CATALOG_PINS)) {
    ensureCatalogPin(name);
  }

  // The python runenv pin exists only when the block has a software
  // module. `ensureCatalogPin` is a no-op when the entry is absent, but
  // gating keeps the intent legible and matches the generator.
  when(
    ({ ctx }) => ctx.modules.some((m) => m.scope === "software"),
    () => ensureCatalogPin(RUNENV_PYTHON),
  );
}
