/** Seeded at init for every module. `pnpm pack` rewrites the facade's
 *  `workspace:*` devDeps to concrete ranges, so a versionless sibling breaks
 *  `do-pack`. Changesets owns the field afterwards. */
export const INITIAL_MODULE_VERSION = "1.0.0";
