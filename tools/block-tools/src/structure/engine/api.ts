// Public API of the structurer engine.
//
// Rule authors import builder types and content forms from here.
// `defineStructure(fn)` is the single entry point — it constructs a
// builder bag, invokes `fn` with it, and returns a plain `Structure`
// object. Builders only exist on the bag; calling one outside the
// lambda is a compile-time error (no runtime guard needed under A2).

import type { ContentForm, ManagedBody, Structure, TriggerFn } from "./ir";
import { defineStructure as _defineStructure } from "./builders";

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

/** Discovered workspace module — every workspace package classified by
 *  DISCOVERY (or supplied by `init`). */
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
  /** `--update-deps` flag. */
  updateDeps: boolean;
  /** Discovered modules (every scope). */
  modules: Module[];
  /** Block vars; on `init` populated from flags/prompts, on
   *  `check`/`refresh` parsed from block/package.json. */
  blockVars: BlockVars;
  /** Layout version read from `.structure-version`. */
  version: number;
  /** True for `check` mode and post-run recheck. */
  dryRun: boolean;
};

export { _defineStructure as defineStructure };
export type { ContentForm, ManagedBody, Structure, TriggerFn };

// --- Builder bag types ---

/** The bag exposed inside `defineStructure(fn)`. */
export type StructureBuilders = {
  scope(name: Scope, body: () => void): void;
  when(trigger: TriggerFn, body: () => void): void;
  fixed(path: string, content: ContentForm): void;
  managed(path: string, initial: ContentForm, body: ManagedBody): void;
  scaffold(path: string, initial: ContentForm): void;
  seed(path: string, initial: ContentForm): void;
  remove(path: string): void;
  rename(from: string, to: string): void;
  // content-form helpers
  file(path: string): ContentForm;
  text(value: string): ContentForm;
  tpl(path: string, vars: Record<string, string>): ContentForm;
  generate(fn: () => unknown): ContentForm;
  /** Access the live `BlockVars` from `ctx`. Throws if no active run. */
  blockVars(): BlockVars;
};
