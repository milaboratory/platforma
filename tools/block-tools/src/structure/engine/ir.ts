// Tree IR for the structurer engine.
//
// `defineStructure(fn)` invokes module-global builders that append to a
// tree of group frames (`scope` / `when` / mode frames) and leaf
// primitives (file / folder actions). `flatten` walks this tree to a
// flat ordered list of `FlatItem`s — each with concrete scope, bound
// module path, composed trigger, resolved filesystem path, and the set
// of run modes the leaf fires in.

import type { Scope, RunContext } from "./api";

/** The three leaf-firing modes. `check` and `refresh` share the
 *  `"default"` mode — they run the same leaves, the `dryRun` flag (carried
 *  separately on `RunContext`) only decides whether writes happen.
 *  `"updateDeps"` is `--update-deps-only`; `"init"` is the init
 *  constructor. A leaf declares which modes it fires in via its enclosing
 *  mode frame (see `ModeFrame`); the runner derives the current mode from
 *  the run context and keeps only the leaves whose membership includes it. */
export type RunMode = "default" | "updateDeps" | "init";

/** Predicate evaluated against derived trigger context. */
export type TriggerContext = {
  ctx: RunContext;
  version: number;
  pathExists(path: string): boolean;
  pathMissing(path: string): boolean;
};

export type TriggerFn = (tctx: TriggerContext) => boolean;

/** Content forms — what to write into a file when creating it.
 *  `tpl.vars` may be a record or a thunk returning a record; the latter
 *  lets rule authors call `blockVars()` lazily at resolve time. */
export type TplVarsLike = Record<string, string> | (() => Record<string, string>);
export type ContentForm =
  | { kind: "file"; path: string }
  | { kind: "text"; value: string }
  | { kind: "tpl"; path: string; vars: TplVarsLike }
  | { kind: "generate"; fn: () => unknown }
  // A binary static asset (e.g. a logo PNG) copied verbatim from the
  // template tree. Carried as raw bytes, never decoded to a string —
  // only `seed` / `scaffold` consume it (via fs.writeBinary).
  | { kind: "binary"; path: string };

/** Builder-body for a `managed` file (the content-rules lambda). */
export type ManagedBody = () => void;

// --- Leaf primitives ---

export type FixedItem = {
  kind: "fixed";
  path: string;
  content: ContentForm;
};

export type ManagedItem = {
  kind: "managed";
  path: string;
  initial: ContentForm;
  body: ManagedBody;
};

export type ScaffoldItem = {
  kind: "scaffold";
  path: string;
  initial: ContentForm;
};

export type SeedItem = {
  kind: "seed";
  path: string;
  initial: ContentForm;
};

export type RemoveItem = {
  kind: "remove";
  path: string;
};

export type RenameItem = {
  kind: "rename";
  from: string;
  to: string;
};

export type LeafItem = FixedItem | ManagedItem | ScaffoldItem | SeedItem | RemoveItem | RenameItem;

// --- Group frames ---

export type ScopeFrame = {
  kind: "scope";
  scope: Scope;
  children: TreeNode[];
};

export type WhenFrame = {
  kind: "when";
  trigger: TriggerFn;
  children: TreeNode[];
};

/** Top-level mode frame: contained leaves fire only in the listed run
 *  modes. Leaves outside any mode frame fire in `["default", "init"]`
 *  (refresh/check + init). `onUpdateDeps()` produces `["updateDeps"]`;
 *  `onInitOrUpdate()` produces `["init", "updateDeps"]`. */
export type ModeFrame = {
  kind: "mode";
  modes: RunMode[];
  children: TreeNode[];
};

export type TreeNode = LeafItem | ScopeFrame | WhenFrame | ModeFrame;

/** Structure object returned by `defineStructure`. */
export type Structure = {
  /** Top-level children — may contain leaves, scope frames, when
   *  frames, and mode frames. */
  children: TreeNode[];
};

// --- Post-flatten ---

/**
 * After fan-out: one entry per (leaf × matching module). `scope` is
 * always set; `modulePath` is the workspace path the leaf is bound to
 * (empty string for the workspace root). `triggers` is the AND of all
 * enclosing `when` predicates. `modes` is the set of run modes the leaf
 * fires in — `["default", "init"]` outside any mode frame, otherwise the
 * enclosing mode frame's `modes`.
 */
export type FlatItem = {
  leaf: LeafItem;
  scope: Scope;
  modulePath: string;
  /** Block-relative resolved path(s). */
  resolvedPath: string;
  /** For rename, the resolved destination. */
  resolvedTo?: string;
  triggers: TriggerFn[];
  modes: RunMode[];
};
