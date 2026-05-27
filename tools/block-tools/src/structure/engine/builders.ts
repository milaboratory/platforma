// `defineStructure` factory + builder-bag (decision A2 in plan.md).
//
// Each call constructs a fresh tree state and a bag of builder
// functions that close over it. The lambda receives the bag and
// appends to the tree by calling the builders. No module-level
// "active context" — the bag is the context. Calling a builder
// outside the lambda is impossible (you have no reference to it).

import type { Scope, StructureBuilders, RunContext, ContentForm, BlockVars } from "./api";
import type { ManagedBody, Structure, TriggerFn, TreeNode, ScopeFrame, WhenFrame } from "./ir";

/** Live run context — set during engine.run, read by `blockVars()` and
 *  any other context-aware builder. The structurer engine pushes a
 *  ctx on the stack before invoking generators / managed bodies. */
let activeRunContext: RunContext | undefined;

/** Engine-internal — push/pop the active run context. Exposed so the
 *  runner can scope `blockVars()` calls inside generators and managed
 *  bodies. */
export function withRunContext<T>(ctx: RunContext, fn: () => T): T {
  const prev = activeRunContext;
  activeRunContext = ctx;
  try {
    return fn();
  } finally {
    activeRunContext = prev;
  }
}

export function defineStructure(fn: (b: StructureBuilders) => void): Structure {
  const root: TreeNode[] = [];
  // Stack of "current children list" — top is where new nodes are
  // appended. Pushed on entering `scope` / `when`, popped on exit.
  const stack: TreeNode[][] = [root];

  function currentChildren(): TreeNode[] {
    return stack[stack.length - 1]!;
  }

  function append(node: TreeNode): void {
    currentChildren().push(node);
  }

  let inScope = false;

  const builders: StructureBuilders = {
    scope(name: Scope, body: () => void): void {
      if (inScope) {
        throw new Error(`scope() cannot nest. Already inside a scope.`);
      }
      const frame: ScopeFrame = { kind: "scope", scope: name, children: [] };
      append(frame);
      stack.push(frame.children);
      inScope = true;
      try {
        body();
      } finally {
        stack.pop();
        inScope = false;
      }
    },

    when(trigger: TriggerFn, body: () => void): void {
      const frame: WhenFrame = {
        kind: "when",
        trigger,
        children: [],
      };
      append(frame);
      stack.push(frame.children);
      try {
        body();
      } finally {
        stack.pop();
      }
    },

    fixed(path: string, content: ContentForm): void {
      append({ kind: "fixed", path, content });
    },

    managed(path: string, initial: ContentForm, body: ManagedBody): void {
      append({ kind: "managed", path, initial, body });
    },

    scaffold(path: string, initial: ContentForm): void {
      append({ kind: "scaffold", path, initial });
    },

    seed(path: string, initial: ContentForm): void {
      append({ kind: "seed", path, initial });
    },

    remove(path: string): void {
      append({ kind: "remove", path });
    },

    rename(from: string, to: string): void {
      append({ kind: "rename", from, to });
    },

    file(path: string): ContentForm {
      return { kind: "file", path };
    },

    text(value: string): ContentForm {
      return { kind: "text", value };
    },

    tpl(path: string, vars: Record<string, string>): ContentForm {
      return { kind: "tpl", path, vars };
    },

    generate(fn: () => unknown): ContentForm {
      return { kind: "generate", fn };
    },

    blockVars(): BlockVars {
      if (!activeRunContext) {
        throw new Error(
          "blockVars() called outside engine.run(). " +
            "Generators and managed bodies only see BlockVars during a run.",
        );
      }
      return activeRunContext.blockVars;
    },
  };

  fn(builders);

  if (stack.length !== 1) {
    throw new Error(
      `defineStructure: builder body left ${stack.length - 1} unclosed group frame(s)`,
    );
  }
  return { children: root };
}
