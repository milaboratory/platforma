// Root `pnpm-workspace.yaml` content rules. Verifies the workspace
// `packages:` list matches the discovered modules and keeps the SDK catalog
// entries exact (strips `^` / `~`). Infra / tooling entries are
// deliberately `~`-floored and left untouched here. Network-bumping
// (`bumpCatalogToLatest`) lives behind a separate `onUpdateDeps` frame.

import { ensureWorkspaceModulePaths, ensureCatalogPin } from "../engine/api";
import { SDK_CATALOG_PINS } from "../templates/generated/root-pnpm-workspace";

export function rootPnpmWorkspaceRules(): void {
  ensureWorkspaceModulePaths();

  // SDK packages are kept exact; the infra floor (turbo/shx/@changesets/cli/
  // vitest + the software-gated runenv) keeps its `~` modifier untouched.
  for (const name of Object.keys(SDK_CATALOG_PINS)) {
    ensureCatalogPin(name);
  }
}
