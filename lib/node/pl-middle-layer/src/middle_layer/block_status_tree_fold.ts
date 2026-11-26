/**
 * Builds the {@link BlockStatusTree} of a block run from the {@link SubtreeFold} of its root.
 *
 * Every counter it shows (contexts, active contexts, compute time, the first failure) is already
 * merged into the fold bottom up, so building the tree touches only the root, its top-level
 * contexts and the children of the expanded contexts. It reads nothing from the action-context
 * tree itself.
 *
 * Source: docs/text/work/projects/sdk/block-status/README_teo.md, "Developer debug panel".
 */

import type {
  BlockStatusSummary,
  BlockStatusTree,
  BlockStatusTreeBranch,
  BlockStatusTreeNode,
  BlockStatusTreeReading,
  BlockStatusTreeTransition,
} from "@milaboratories/pl-model-middle-layer";
import { BlockStatusTreeHeaviestCount } from "@milaboratories/pl-model-middle-layer";
import { BlockRunCancelledReason } from "../mutator/template/render_block";
import type { ActionContextNode, ContextFold, SubtreeFold } from "./block_status_fold";
import {
  compareNs,
  ExecNamespace,
  foldSubtree,
  nsToMs,
  summarize,
  WorkdirNamespace,
} from "./block_status_fold";

/** A tree with no context under it. */
export function emptyBlockStatusTree(summary: BlockStatusSummary): BlockStatusTree {
  return { summary, heaviest: { byCompute: [], byContexts: [] } };
}

/**
 * The tree of a block run.
 *
 * @param expanded context ids whose children the reader has opened. The root's children are
 *                 always present.
 */
export function blockStatusTree(
  root: SubtreeFold,
  summary: BlockStatusSummary,
  expanded: ReadonlySet<string>,
): BlockStatusTree {
  // A command still running is counted up to the run's latest report, not to now: the fold has no
  // clock, and the Desktop App extrapolates the same way for the run's own time.
  const computeMs = (fold: SubtreeFold): number => {
    const { closedNs, open, openSinceSumNs } = fold.compute;
    const lastNs = root.lastNs === undefined ? 0n : BigInt(root.lastNs);
    return Number((closedNs + BigInt(open) * lastNs - openSinceSumNs) / 1_000_000n);
  };

  // A stopped run's render is gone and reports nothing more, so its nodes keep the state they
  // were in. Every node that had not ended was stopped with it.
  const cancelled = summary.cancelled === true;

  const node = (fold: SubtreeFold, isRoot: boolean): BlockStatusTreeNode => {
    const { own } = fold;
    const stopped = cancelled && !own.folded.terminal;
    const holding = stopped ? undefined : own.folded.holding;
    return {
      contextId: own.id,
      name: nameOf(own),
      kind: kindOf(own),
      baggage: baggageOf(own),
      state: holding?.state,
      onMachine: stopped ? false : own.folded.onMachine,
      enteredAt: holding === undefined ? undefined : nsToMs(holding.ns),
      ended: own.folded.terminal || stopped,
      failure: own.folded.failure || (stopped ? BlockRunCancelledReason : undefined),
      transitions: transitionsOf(own),
      readings: readingsOf(own),
      childCount: fold.children.length,
      subtreeContexts: fold.contexts,
      subtreeActiveContexts: cancelled ? 0 : fold.activeContexts,
      subtreeComputeMs: computeMs(fold),
      children:
        isRoot || expanded.has(own.id)
          ? fold.children.map((child) => node(child, false))
          : undefined,
    };
  };

  /** The root's top-level contexts, ranked by one measure. One with nothing to rank is left out. */
  const rank = (value: (fold: SubtreeFold) => number): BlockStatusTreeBranch[] =>
    root.children
      .map((child) => ({ contextId: child.own.id, name: nameOf(child.own), value: value(child) }))
      .filter((b) => b.value > 0)
      .sort((a, b) => b.value - a.value || a.contextId.localeCompare(b.contextId))
      .slice(0, BlockStatusTreeHeaviestCount);

  return {
    summary,
    heaviest: {
      byCompute: rank(computeMs),
      byContexts: rank((fold) => fold.contexts),
      // No reporter writes file sizes yet.
      byFileSize: undefined,
    },
    root: node(root, true),
    firstFailurePath: root.failure?.path,
  };
}

/** {@link blockStatusTree} over a tree that is read once. */
export function foldBlockStatusTree(
  root: ActionContextNode,
  expanded: ReadonlySet<string>,
): BlockStatusTree {
  const fold = foldSubtree(root);
  return blockStatusTree(fold, summarize(fold), expanded);
}

function nameOf(own: ContextFold): string {
  const name = own.data?.name;
  return typeof name === "string" && name !== "" ? name : own.id;
}

function kindOf(own: ContextFold): BlockStatusTreeNode["kind"] {
  const all = own.reports.all;
  if (all.some((t) => t.namespace === ExecNamespace)) return "command";
  if (all.length > 0 && all.every((t) => t.namespace === WorkdirNamespace)) return "workdir";
  return "render";
}

function baggageOf(own: ContextFold): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(own.data ?? {}))
    if (key !== "name") out[key] = typeof value === "string" ? value : JSON.stringify(value);
  return out;
}

function transitionsOf(own: ContextFold): BlockStatusTreeTransition[] {
  return [...own.reports.all]
    .sort((a, b) => compareNs(a.ns, b.ns))
    .map((t) => ({
      namespace: t.namespace,
      reporter: t.reporter,
      state: t.state,
      detail: t.detail || undefined,
      reason: t.reason || undefined,
      at: nsToMs(t.ns),
    }));
}

function readingsOf(own: ContextFold): BlockStatusTreeReading[] {
  return [...own.readings].sort(
    (a, b) =>
      a.namespace.localeCompare(b.namespace) ||
      a.resource.localeCompare(b.resource) ||
      a.key.localeCompare(b.key),
  );
}
