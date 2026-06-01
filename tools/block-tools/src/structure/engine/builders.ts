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

/** Engine-internal: scope `blockVars()` lookups during a run. Accepts
 *  sync or async bodies; awaits Promise-returning ones so the active
 *  context survives across `await` points inside the runner. */
export async function withRunContext<T>(ctx: RunContext, fn: () => T | Promise<T>): Promise<T> {
  const prev = activeRunContext;
  activeRunContext = ctx;
  try {
    return await fn();
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

export function registerInnerWhenHandler(h: InnerWhenHandler): void {
  innerWhenHandler = h;
}

/**
 * Conditionally run `body`. Two dispatch modes by active state:
 *  - inside `defineStructure(...)` → push a `WhenFrame` into the tree;
 *    trigger fires later at runner time per `FlatItem`.
 *  - inside a `managed(...)` body → evaluate `trigger` immediately
 *    against the runner-supplied `TriggerContext`; run/skip `body`
 *    synchronously.
 *
 * One `when` symbol for both layers — same user contract, dispatch
 * picks the matching execution timing.
 */
export function when(trigger: TriggerFn, body: () => void): void {
  if (activeTree) {
    const t = activeTree;
    const frame: WhenFrame = { kind: "when", trigger, children: [] };
    t.stack[t.stack.length - 1]!.push(frame);
    t.stack.push(frame.children);
    try {
      body();
    } finally {
      t.stack.pop();
    }
    return;
  }
  if (innerWhenHandler && innerWhenHandler(trigger, body)) return;
  throw new Error(
    "when() called outside defineStructure() and outside any managed(...) body. " +
      "Place this call inside one of the two.",
  );
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

export function fixed(path: string, content: ContentForm): void {
  appendNode("fixed", { kind: "fixed", path, content });
}

export function managed(path: string, initial: ContentForm, body: ManagedBody): void {
  appendNode("managed", { kind: "managed", path, initial, body });
}

export function scaffold(path: string, initial: ContentForm): void {
  appendNode("scaffold", { kind: "scaffold", path, initial });
}

export function seed(path: string, initial: ContentForm): void {
  appendNode("seed", { kind: "seed", path, initial });
}

export function remove(path: string): void {
  appendNode("remove", { kind: "remove", path });
}

export function rename(from: string, to: string): void {
  appendNode("rename", { kind: "rename", from, to });
}

export function file(path: string): ContentForm {
  return { kind: "file", path };
}

/** A binary static asset (e.g. a logo) read verbatim from `<root>/static/`.
 *  Unlike `file()`, the bytes are never decoded to a string — use for
 *  images / archives. Only valid inside `seed()` / `scaffold()`. */
export function binaryFile(path: string): ContentForm {
  return { kind: "binary", path };
}

export function text(value: string): ContentForm {
  return { kind: "text", value };
}

export function tpl(
  path: string,
  vars: Record<string, string> | (() => Record<string, string>),
): ContentForm {
  return { kind: "tpl", path, vars };
}

export function generate(fn: () => unknown): ContentForm {
  return { kind: "generate", fn };
}

export function blockVars(): BlockVars {
  if (!activeRunContext) {
    throw new Error(
      "blockVars() called outside engine.run(). " +
        "Generators and managed bodies only see BlockVars during a run.",
    );
  }
  return activeRunContext.blockVars;
}
