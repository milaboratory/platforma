import { transformAt } from "../../engine/api";

/** Seeded at init for every module. `pnpm pack` rewrites the facade's
 *  `workspace:*` devDeps to concrete ranges, so a versionless sibling breaks
 *  `do-pack`. Changesets owns the field afterwards. */
export const INITIAL_MODULE_VERSION = "1.0.0";

/** Backfill `version` on a sibling that has none — a block scaffolded before
 *  the initials seeded the field keeps its versionless manifests through a
 *  `structure refresh`, and `do-pack` then dies resolving the facade's
 *  `workspace:*` deps. Never touches an existing value: past init the field
 *  belongs to changesets. */
export function ensureModuleVersion(): void {
  transformAt<unknown>("version", (current) =>
    typeof current === "string" && current.length > 0 ? current : INITIAL_MODULE_VERSION,
  );
}
