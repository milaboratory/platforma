// Public API of the structurer engine.
//
// `defineStructure(() => { ... })` is the single entry point. Inside
// the lambda, rule authors call builders imported by name from this
// module — `scope`, `when`, `fixed`, `managed`, `scaffold`, `seed`,
// `remove`, `rename`, `onUpdateDeps`, plus the content-form helpers
// `file` / `text` / `tpl` / `generate`. Builders read a module-global
// active context (set up by `defineStructure`) and append to its tree.
// Calling a builder outside `defineStructure` throws at runtime.

import type { ContentForm, ManagedBody, Structure, TriggerFn } from "./ir";

export type Scope = "root" | "block" | "model" | "ui" | "workflow" | "test" | "software";

/** Variables describing a block — populated by `init` or parsed by
 *  `check`/`refresh` from the block's package.json `name`. */
export type BlockVars = {
  /** e.g. `@platforma-open/my-org.mixcr-clonotyping` */
  facadeName: string;
  /** e.g. `my-org.mixcr-clonotyping` */
  baseName: string;
  /** e.g. `@platforma-open` */
  npmOrg: string;
  /** e.g. `my-org` */
  orgScope: string;
  /** e.g. `mixcr-clonotyping` */
  shortName: string;
  /** Platforms picked at init for the software sub-package. Only
   *  populated by `init`; absent on `check` / `refresh`. */
  softwarePlatforms?: string[];
};

/** Discovered workspace module. */
export type Module = {
  scope: Scope;
  /** Package name from the module's package.json. */
  name: string;
  /** Block-relative path of the module ("" for workspace root). */
  path: string;
};

/** Run context — passed into engine.run and surfaced inside trigger
 *  predicates as the `ctx` field. */
export type RunContext = {
  /** `--sdk-internal` flag. */
  isSdkInternal: boolean;
  /** `--update-deps-only` flag. When true, only `onUpdateDeps` leaves
   *  fire; all normal-mode leaves are skipped. The caller is then
   *  expected to run `pnpm install` and re-invoke `refresh` without
   *  the flag for the normal-mode rules to apply against the updated
   *  dep set. */
  updateDepsOnly: boolean;
  /** Discovered modules (every scope). */
  modules: Module[];
  /** Block vars; on `init` populated from flags/prompts, on
   *  `check`/`refresh` parsed from block/package.json. */
  blockVars: BlockVars;
  /** Layout version read from `.structure`. */
  version: number;
  /** True for `check` mode and the post-run recheck. */
  dryRun: boolean;
};

export type { ContentForm, ManagedBody, Structure, TriggerFn };

export {
  defineStructure,
  scope,
  when,
  onUpdateDeps,
  fixed,
  managed,
  scaffold,
  seed,
  remove,
  rename,
  file,
  text,
  tpl,
  generate,
  blockVars,
} from "./builders";

export {
  // JSON managed builders
  ensureField,
  removeField,
  requireField,
  ensureFieldEntries,
  ensureScript,
  removeScript,
  ensureDep,
  ensureDevDep,
  ensurePeerDep,
  ensureOptionalDep,
  removeDep,
  ensureDeps,
  ensureDevDeps,
  ensurePeerDeps,
  ensureOptionalDeps,
  ensureWorkspaceScopeDeps,
  ensureWorkspaceScopeDevDeps,
  ensureWorkspaceScopePeerDeps,
  pruneKeysMatching,
  pruneKeysMatchingAt,
  enforceFieldOrder,
  enforceFieldOrderAt,
  enforceAlphabeticalOrder,
  transformAt,
  // YAML managed builders
  ensureWorkspaceModulePaths,
  ensureCatalogPin,
  ensureCatalogVersion,
  pinCatalogTo,
  bumpCatalogToLatest,
  // Lines managed builders
  ensureGitignoreEntries,
  removeGitignoreEntries,
  // Active-state wrappers (engine-internal but exported for tests).
  withManagedBody,
  withManagedYaml,
  withManagedLines,
} from "./content-rules";

export type { DepVersion } from "./content-rules";
