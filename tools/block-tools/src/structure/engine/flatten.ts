// Flatten: DFS over the tree IR; fan out each scope frame once per
// matching module in `ctx.modules`. Compose enclosing `when` triggers
// (AND of all on the path from root). Track whether the leaf was
// inside an `onUpdateDeps` frame and emit that as `updateDepsOnly` on
// the FlatItem. No execution here — execution lives in `runner.ts`
// (step 2).

import type { Module, RunContext, Scope } from "./api";
import type { FlatItem, LeafItem, Structure, TreeNode, TriggerFn } from "./ir";

function resolveRelative(modulePath: string, fileRel: string): string {
  if (!modulePath) return fileRel;
  if (!fileRel) return modulePath;
  // Strip trailing slash on modulePath, leading slash on fileRel.
  const m = modulePath.endsWith("/") ? modulePath.slice(0, -1) : modulePath;
  const f = fileRel.startsWith("/") ? fileRel.slice(1) : fileRel;
  return f ? `${m}/${f}` : m;
}

/**
 * Lexicographic sort of modules by `path`.
 * Used for deterministic fan-out order (per spec.md).
 */
function modulesByScope(modules: Module[], scope: Scope): Module[] {
  return modules
    .filter((m) => m.scope === scope)
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function flatten(structure: Structure, ctx: RunContext): FlatItem[] {
  const out: FlatItem[] = [];

  function visit(
    node: TreeNode,
    boundScope: Scope | undefined,
    boundModulePath: string | undefined,
    triggers: TriggerFn[],
    inUpdateDeps: boolean,
  ): void {
    if (node.kind === "scope") {
      const matches = modulesByScope(ctx.modules, node.scope);
      for (const m of matches) {
        for (const child of node.children) {
          visit(child, node.scope, m.path, triggers, inUpdateDeps);
        }
      }
      return;
    }
    if (node.kind === "when") {
      const nextTriggers = triggers.concat(node.trigger);
      for (const child of node.children) {
        visit(child, boundScope, boundModulePath, nextTriggers, inUpdateDeps);
      }
      return;
    }
    if (node.kind === "onUpdateDeps") {
      for (const child of node.children) {
        visit(child, boundScope, boundModulePath, triggers, true);
      }
      return;
    }
    // Leaf.
    if (boundScope === undefined || boundModulePath === undefined) {
      throw new Error(`flatten: leaf '${describeLeaf(node)}' is not inside a scope() frame`);
    }
    if (node.kind === "rename") {
      out.push({
        leaf: node,
        scope: boundScope,
        modulePath: boundModulePath,
        resolvedPath: resolveRelative(boundModulePath, node.from),
        resolvedTo: resolveRelative(boundModulePath, node.to),
        triggers,
        updateDepsOnly: inUpdateDeps,
      });
      return;
    }
    out.push({
      leaf: node,
      scope: boundScope,
      modulePath: boundModulePath,
      resolvedPath: resolveRelative(boundModulePath, leafPath(node)),
      triggers,
      updateDepsOnly: inUpdateDeps,
    });
  }

  for (const node of structure.children) {
    visit(node, undefined, undefined, [], false);
  }

  return out;
}

function leafPath(leaf: LeafItem): string {
  switch (leaf.kind) {
    case "fixed":
    case "managed":
    case "scaffold":
    case "seed":
    case "remove":
      return leaf.path;
    case "rename":
      return leaf.from;
  }
}

function describeLeaf(leaf: LeafItem): string {
  if (leaf.kind === "rename") return `rename ${leaf.from} -> ${leaf.to}`;
  return `${leaf.kind} ${leaf.path}`;
}
