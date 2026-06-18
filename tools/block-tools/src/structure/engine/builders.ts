// `defineStructure` + the module-global builder set.
//
// Active context is a module-level mutable: `defineStructure` pushes a
// fresh tree state, invokes the zero-arg lambda, pops, returns. Each
// builder reads the active state and appends to the current children
// list. Calling a builder outside `defineStructure` throws with a
// clear message. Re-entering `defineStructure` from inside another
// `defineStructure` lambda is rejected.

import type { Scope, RunContext, BlockVars, ContentForm } from "./api";
import type {
  ManagedBody,
  Structure,
  TriggerFn,
  TreeNode,
  ScopeFrame,
  WhenFrame,
  ModeFrame,
  RunMode,
} from "./ir";

type TreeState = {
  root: TreeNode[];
  /** Stack of children-lists; top is where new nodes append. */
  stack: TreeNode[][];
  inScope: boolean;
};

let activeTree: TreeState | undefined;
let activeRunContext: RunContext | undefined;

function requireActiveTree(builder: string): TreeState {
  if (!activeTree) {
    throw new Error(
      `${builder}() called outside defineStructure(). ` +
        `Builders must run inside the lambda passed to defineStructure(...).`,
    );
  }
  return activeTree;
}

function appendNode(builder: string, node: TreeNode): void {
  const t = requireActiveTree(builder);
  t.stack[t.stack.length - 1]!.push(node);
}

/** Engine-internal: scope `blockVars()` lookups during a run. The body is
 *  synchronous, so the module-global `activeRunContext` cannot be observed
 *  by an interleaved run — a sync call stack runs to completion before any
 *  other `run()` can start. The try/finally restores the previous context
 *  (supporting the nested-run case the post-run recheck used to imply). */
export function withRunContext<T>(ctx: RunContext, fn: () => T): T {
  const prev = activeRunContext;
  activeRunContext = ctx;
  try {
    return fn();
  } finally {
    activeRunContext = prev;
  }
}

/** Engine-internal: content-rule builders that need `ctx.modules` look
 *  up the active context through this accessor. Returns `undefined`
 *  outside a run. */
export function tryGetActiveRunContext(): RunContext | undefined {
  return activeRunContext;
}

/** Get-or-die counterpart of `tryGetActiveRunContext`. Generators run
 *  only inside `engine.run()`; an absent context is framework misuse, not
 *  a valid state, so throw rather than emit degenerate (empty) output.
 *  Mirrors `blockVars()`. */
export function getActiveRunContext(): RunContext {
  if (!activeRunContext) {
    throw new Error(
      "getActiveRunContext() called outside engine.run(). " +
        "Generators only see the run context during a run.",
    );
  }
  return activeRunContext;
}

/** The single entry point: build a {@link Structure} from `fn`, which calls
 *  the scaffold-DSL builders (`scope`, `fixed`, `managed`, `seed`, …). Throws
 *  if called nested, or if `fn` leaves an unclosed group frame. */
export function defineStructure(fn: () => void): Structure {
  if (activeTree) {
    throw new Error("defineStructure() cannot be called from inside another defineStructure().");
  }
  const root: TreeNode[] = [];
  const state: TreeState = { root, stack: [root], inScope: false };
  activeTree = state;
  try {
    fn();
    if (state.stack.length !== 1) {
      throw new Error(
        `defineStructure: builder body left ${state.stack.length - 1} unclosed group frame(s)`,
      );
    }
    const structure: Structure = { children: root };
    // Validation: a path may not appear as both `seed` and any
    // engine-managed primitive (`fixed` / `managed` / `scaffold`) within
    // the same scope. The two contracts (write-once-and-ignore vs
    // rewrite-on-every-refresh) are mutually exclusive. Detect at
    // tree-build time.
    validateSeedDisjointness(structure);
    return structure;
  } finally {
    activeTree = undefined;
  }
}

function validateSeedDisjointness(structure: Structure): void {
  // (scope) → (path) → set of leaf kinds present at that path.
  const perScope = new Map<string, Map<string, Set<string>>>();

  function visit(node: TreeNode, scopeName: string): void {
    if (node.kind === "scope") {
      for (const c of node.children) visit(c, node.scope);
      return;
    }
    if (node.kind === "when" || node.kind === "mode") {
      for (const c of node.children) visit(c, scopeName);
      return;
    }
    if (node.kind === "rename") return; // rename works on paths; not a content leaf
    let scopeMap = perScope.get(scopeName);
    if (!scopeMap) {
      scopeMap = new Map();
      perScope.set(scopeName, scopeMap);
    }
    let kinds = scopeMap.get(node.path);
    if (!kinds) {
      kinds = new Set();
      scopeMap.set(node.path, kinds);
    }
    kinds.add(node.kind);
  }

  for (const n of structure.children) visit(n, "(top-level)");

  for (const [scopeName, paths] of perScope) {
    for (const [path, kinds] of paths) {
      if (
        kinds.has("seed") &&
        (kinds.has("managed") || kinds.has("fixed") || kinds.has("scaffold"))
      ) {
        const others = [...kinds]
          .filter((k) => k !== "seed")
          .sort()
          .join(", ");
        throw new Error(
          `defineStructure validation: path '${path}' under scope '${scopeName}' ` +
            `is declared as both seed and ${others}. Seeds are block-author territory ` +
            `(written once at init, untouched thereafter); engine-managed primitives ` +
            `(fixed/managed/scaffold) rewrite on every refresh. The two contracts cannot ` +
            `coexist on the same path.`,
        );
      }
    }
  }
}

/** Open a scope (`root` / `block` / `model` / `ui` / `workflow` / `test` /
 *  `software`); builders called inside `body` attach to it. Cannot nest. */
export function scope(name: Scope, body: () => void): void {
  const t = requireActiveTree("scope");
  if (t.inScope) {
    throw new Error("scope() cannot nest. Already inside a scope.");
  }
  const frame: ScopeFrame = { kind: "scope", scope: name, children: [] };
  t.stack[t.stack.length - 1]!.push(frame);
  t.stack.push(frame.children);
  t.inScope = true;
  try {
    body();
  } finally {
    t.stack.pop();
    t.inScope = false;
  }
}

/** Inner-mode `when` handler. Registered by `content-rules.ts` at
 *  load time. Returns true if the call was dispatched (an inner active
 *  state was present); false otherwise. Avoids a circular import. */
type InnerWhenHandler = (trigger: TriggerFn, body: () => void) => boolean;
let innerWhenHandler: InnerWhenHandler | undefined;

/** Engine-internal: register the inner-mode `when` handler (set by
 *  `content-rules.ts` at load time to avoid a circular import). */
export function registerInnerWhenHandler(h: InnerWhenHandler): void {
  innerWhenHandler = h;
}

/**
 * Conditionally run `body`, with an optional `elseBody`. One `when` symbol for
 * both layers — `dispatchWhen` picks the timing:
 *  - inside `defineStructure(...)` → register a `WhenFrame`; its trigger fires
 *    later, per module, at runner time.
 *  - inside a `managed(...)` body → evaluate the trigger against the live block
 *    now and run/skip synchronously.
 *
 * `else` is just the negated trigger dispatched the same way, so exactly one
 * branch applies (in either layer).
 */
export function when(trigger: TriggerFn, body: () => void, elseBody?: () => void): void {
  dispatchWhen(trigger, body);
  if (elseBody) dispatchWhen((tctx) => !trigger(tctx), elseBody);
}

/** Single-branch dispatch shared by both `when` branches. In a managed body the
 *  handler runs `body` iff its trigger holds and returns whether a managed-body
 *  context existed; no context — and not tree-build either — means `when()` was
 *  called outside both layers, a misuse. */
function dispatchWhen(trigger: TriggerFn, body: () => void): void {
  if (activeTree) {
    pushWhenFrame(trigger, body);
    return;
  }
  const handled = innerWhenHandler?.(trigger, body) ?? false;
  if (!handled) {
    throw new Error(
      "when() called outside defineStructure() and outside any managed(...) body. " +
        "Place this call inside one of the two.",
    );
  }
}

function pushWhenFrame(trigger: TriggerFn, body: () => void): void {
  const t = activeTree!;
  const frame: WhenFrame = { kind: "when", trigger, children: [] };
  t.stack[t.stack.length - 1]!.push(frame);
  t.stack.push(frame.children);
  try {
    body();
  } finally {
    t.stack.pop();
  }
}

/** Trigger factory: true when at least one file in the leaf's module
 *  matches `glob` (module-relative — see `TriggerContext.filesMatch`). Use
 *  to gate a rule on the presence of co-located files, e.g. add a vitest
 *  `test` script only when `src/**\/*.test.ts` exists. Pairs with `when`:
 *  `when(whenFilesExist("src/**\/*.test.ts"), () => { ... })`. */
export function whenFilesExist(glob: string): TriggerFn {
  return (tctx) => tctx.filesMatch(glob);
}

function pushModeFrame(builder: string, modes: RunMode[], body: () => void): void {
  const t = requireActiveTree(builder);
  const frame: ModeFrame = { kind: "mode", modes, children: [] };
  t.stack[t.stack.length - 1]!.push(frame);
  t.stack.push(frame.children);
  try {
    body();
  } finally {
    t.stack.pop();
  }
}

/** Leaves inside fire ONLY under `--update-deps-only` (mode
 *  `"updateDeps"`); they are skipped on default refresh/check and init. */
export function onUpdateDeps(body: () => void): void {
  pushModeFrame("onUpdateDeps", ["updateDeps"], body);
}

/** Leaves inside fire on `init` AND `--update-deps-only`, but NOT on
 *  default refresh/check. The frame for rules that resolve/write current
 *  versions: both init and update-deps mean "fetch and write latest",
 *  while a plain refresh leaves them as the author/lockfile has them. */
export function onInitOrUpdate(body: () => void): void {
  pushModeFrame("onInitOrUpdate", ["init", "updateDeps"], body);
}

/** Engine-OWNED file: (re)written verbatim from `content` on every refresh —
 *  author edits are overwritten. */
export function fixed(path: string, content: ContentForm): void {
  appendNode("fixed", { kind: "fixed", path, content });
}

/** Engine-RECONCILED file: parsed from disk (or `initial` when absent),
 *  mutated by `body` (the JSON/YAML/lines builders), then re-serialised.
 *  Content the body does not touch is preserved. */
export function managed(path: string, initial: ContentForm, body: ManagedBody): void {
  appendNode("managed", { kind: "managed", path, initial, body });
}

/** Write-once file: created from `initial` if absent (on init AND refresh),
 *  never overwritten once present. For files the author subsequently owns. */
export function scaffold(path: string, initial: ContentForm): void {
  appendNode("scaffold", { kind: "scaffold", path, initial });
}

/** Author-owned starter file: written from `initial` only on `init`, and only
 *  if absent; `refresh` / `check` never touch it. */
export function seed(path: string, initial: ContentForm): void {
  appendNode("seed", { kind: "seed", path, initial });
}

/** Delete `path` if present, on every refresh. */
export function remove(path: string): void {
  appendNode("remove", { kind: "remove", path });
}

/** Rename file `from` → `to` on refresh (migrating a renamed scaffold file). */
export function rename(from: string, to: string): void {
  appendNode("rename", { kind: "rename", from, to });
}

/** Content form: a UTF-8 static template read from the structurer's static
 *  templates. Use inside `fixed` / `managed` / `scaffold` / `seed`. */
export function file(path: string): ContentForm {
  return { kind: "file", path };
}

/** A binary static asset (e.g. a logo) read verbatim from `<root>/static/`.
 *  Unlike `file()`, the bytes are never decoded to a string — use for
 *  images / archives. Only valid inside `seed()` / `scaffold()`. */
export function binaryFile(path: string): ContentForm {
  return { kind: "binary", path };
}

/** Content form: an inline literal string. */
export function text(value: string): ContentForm {
  return { kind: "text", value };
}

/** Content form: a text template (the structurer's `text/` templates) with
 *  `${var}` placeholders substituted from `vars`. When `vars` is a function it
 *  receives the active {@link RunContext} at resolve time. */
export function tpl(
  path: string,
  vars: Record<string, string> | ((ctx: RunContext) => Record<string, string>),
): ContentForm {
  return { kind: "tpl", path, vars };
}

/** Content form: content computed at run time from the active
 *  {@link RunContext}. The return value is serialised as JSON / YAML by the
 *  target file's extension, or used verbatim if it is already a string. */
export function generate(fn: (ctx: RunContext) => unknown): ContentForm {
  return { kind: "generate", fn };
}

/** The active run's {@link BlockVars} (block name parts + software platform).
 *  Valid only during a run (inside a generator or managed body); throws
 *  otherwise. */
export function blockVars(): BlockVars {
  if (!activeRunContext) {
    throw new Error(
      "blockVars() called outside engine.run(). " +
        "Generators and managed bodies only see BlockVars during a run.",
    );
  }
  return activeRunContext.blockVars;
}
