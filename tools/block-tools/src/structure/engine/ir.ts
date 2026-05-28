// Tree IR for the structurer engine.
//
// `defineStructure(fn)` invokes module-global builders that append to a
// tree of group frames (`scope` / `when` / `onUpdateDeps`) and leaf
// primitives (file / folder actions). `flatten` walks this tree to a
// flat ordered list of `FlatItem`s — each with concrete scope, bound
// module path, composed trigger, resolved filesystem path, and the
// `updateDepsOnly` flag (true iff the leaf was inside an
// `onUpdateDeps` frame).

import type { Scope, RunContext } from "./api";

/** Predicate evaluated against derived trigger context. */
export type TriggerContext = {
  ctx: RunContext;
  version: number;
  pathExists(path: string): boolean;
  pathMissing(path: string): boolean;
};

export type TriggerFn = (tctx: TriggerContext) => boolean;

/** Content forms — what to write into a file when creating it. */
export type ContentForm =
  | { kind: "file"; path: string }
  | { kind: "text"; value: string }
  | { kind: "tpl"; path: string; vars: Record<string, string> }
  | { kind: "generate"; fn: () => unknown };

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

/** Top-level mode frame: contained leaves fire only when
 *  `ctx.updateDepsOnly` is true; all other leaves are skipped in that
 *  mode. Mutually exclusive with normal-mode leaves at runtime. */
export type OnUpdateDepsFrame = {
  kind: "onUpdateDeps";
  children: TreeNode[];
};

export type TreeNode = LeafItem | ScopeFrame | WhenFrame | OnUpdateDepsFrame;

/** Structure object returned by `defineStructure`. */
export type Structure = {
  /** Top-level children — may contain leaves, scope frames, when
   *  frames, and onUpdateDeps frames. */
  children: TreeNode[];
};

// --- Post-flatten ---

/**
 * After fan-out: one entry per (leaf × matching module). `scope` is
 * always set; `modulePath` is the workspace path the leaf is bound to
 * (empty string for the workspace root). `triggers` is the AND of all
 * enclosing `when` predicates. `updateDepsOnly` is true iff the leaf
 * was inside an `onUpdateDeps` frame.
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
  updateDepsOnly: boolean;
};
