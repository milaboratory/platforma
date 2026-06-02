// Root `pnpm-workspace.yaml` content rules. Default refresh is purely
// structural here: it verifies the workspace `packages:` list matches the
// discovered modules and leaves every catalog version exactly as the
// author/lockfile has it. Version resolution (writing npm-latest for the
// SDK families) lives in the separate `onInitOrUpdate` frame
// (`rootCatalogBumpRules`), which fires on init + update-deps only.

import { ensureWorkspaceModulePaths } from "../engine/api";

export function rootPnpmWorkspaceRules(): void {
  ensureWorkspaceModulePaths();
}
