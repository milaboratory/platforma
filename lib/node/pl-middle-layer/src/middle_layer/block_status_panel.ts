/**
 * Folds a block's action-context tree into the {@link BlockStatusPanel} of the developer debug panel.
 *
 * Every node is walked, because the per-subtree counters and the heaviest branches need the whole
 * tree, but only the root, its top-level nodes and the expanded nodes' children are put in the
 * result: a run can make thousands of nodes, and the panel is pushed on every report.
 *
 * Source: docs/text/work/projects/sdk/block-status/README_teo.md, "Developer debug panel".
 */

import type {
  BlockStatusPanel,
  BlockStatusPanelReading,
  BlockStatusPanelBranch,
  BlockStatusPanelNode,
  BlockStatusPanelTransition,
} from "@milaboratories/pl-model-middle-layer";
import { BlockStatusPanelHeaviestCount } from "@milaboratories/pl-model-middle-layer";
import type { ActionContextNode, FoldedNode, RawTransition } from "./block_status_fold";
import {
  ChildFieldPrefix,
  compareNs,
  ExecNamespace,
  foldBlockStatus,
  foldNode,
  MaxDepth,
  nsToMs,
  readTransitions,
} from "./block_status_fold";

/** Prefix of the reading keys: `reading/<namespace>/<resource>/<key>`. */
const ReadingPrefix = "reading/";

/** The namespace a work dir reports under. */
const WorkdirNamespace = "workdir";

/** One context, read once, with its children. Kept for every node until the result is built. */
type Read = {
  node: ActionContextNode;
  folded: FoldedNode;
  all: RawTransition[];
  /** Closed `exec` Running intervals of this node, ns. */
  closedComputeNs: bigint;
  /** Start of each `exec` reporter still Running, ns. Closed against the run's latest report. */
  openComputeSince: string[];
  children: Read[];
};

/**
 * The debug panel of a block run, from the root action context of its render.
 *
 * @param expanded context ids whose children the developer has opened. The root's children are
 *                 always present.
 */
export function foldBlockStatusPanel(
  root: ActionContextNode,
  expanded: ReadonlySet<string>,
): BlockStatusPanel {
  const summary = foldBlockStatus(root);
  const tree = readTree(root, new Set(), 0);
  if (tree === undefined) return { summary, heaviest: { byCompute: [], byNodes: [] } };

  // A running command is counted up to the run's latest report, not to now: the fold has no clock,
  // and the Desktop App extrapolates the same way for the run's own time.
  const lastNs = latestNs(tree);
  const totals = new Map<Read, Totals>();
  subtreeTotals(tree, lastNs, totals);

  const rootNode = panelNode(tree, totals, expanded, true);
  return { summary, heaviest: heaviest(tree, totals), root: rootNode };
}

function readTree(node: ActionContextNode, seen: Set<string>, depth: number): Read | undefined {
  if (depth > MaxDepth || seen.has(node.id)) return undefined;
  seen.add(node.id);

  const reports = readTransitions(node);
  const { closed, open } = computeIntervals(reports.all);
  const children: Read[] = [];
  for (const field of node.listFields()) {
    if (!field.startsWith(ChildFieldPrefix)) continue;
    const child = node.traverse(field);
    if (child === undefined) continue;
    const read = readTree(child, seen, depth + 1);
    if (read !== undefined) children.push(read);
  }

  return {
    node,
    folded: foldNode(reports.known),
    all: reports.all,
    closedComputeNs: closed,
    openComputeSince: open,
    children,
  };
}

/**
 * The time each command reporter spent in `Running`, from each Running to the reporter's next
 * transition. A reporter whose latest transition is Running is still open.
 */
function computeIntervals(all: readonly RawTransition[]): { closed: bigint; open: string[] } {
  const byReporter = new Map<string, RawTransition[]>();
  for (const t of all) {
    if (t.namespace !== ExecNamespace) continue;
    const list = byReporter.get(t.reporter);
    if (list === undefined) byReporter.set(t.reporter, [t]);
    else list.push(t);
  }

  let closed = 0n;
  const open: string[] = [];
  for (const list of byReporter.values()) {
    list.sort((a, b) => compareNs(a.ns, b.ns));
    for (let i = 0; i < list.length; i++) {
      if (list[i].state !== "Running") continue;
      const next = list[i + 1];
      if (next === undefined) open.push(list[i].ns);
      else closed += BigInt(next.ns) - BigInt(list[i].ns);
    }
  }
  return { closed, open };
}

function latestNs(read: Read): string | undefined {
  let latest: string | undefined;
  const visit = (r: Read) => {
    for (const t of r.all) if (latest === undefined || compareNs(t.ns, latest) > 0) latest = t.ns;
    r.children.forEach(visit);
  };
  visit(read);
  return latest;
}

type Totals = { nodes: number; live: number; computeNs: bigint };

function subtreeTotals(read: Read, lastNs: string | undefined, out: Map<Read, Totals>): Totals {
  let computeNs = read.closedComputeNs;
  if (lastNs !== undefined)
    for (const since of read.openComputeSince) computeNs += BigInt(lastNs) - BigInt(since);

  const totals: Totals = { nodes: 1, live: read.folded.terminal ? 0 : 1, computeNs };
  for (const child of read.children) {
    const c = subtreeTotals(child, lastNs, out);
    totals.nodes += c.nodes;
    totals.live += c.live;
    totals.computeNs += c.computeNs;
  }
  out.set(read, totals);
  return totals;
}

function nameOf(read: Read): string {
  const name = read.node.getData()?.name;
  return typeof name === "string" && name !== "" ? name : read.node.id;
}

function panelNode(
  read: Read,
  totals: Map<Read, Totals>,
  expanded: ReadonlySet<string>,
  isRoot: boolean,
): BlockStatusPanelNode {
  const own = totals.get(read)!;
  const showChildren = isRoot || expanded.has(read.node.id);
  return {
    contextId: read.node.id,
    name: nameOf(read),
    kind: kindOf(read.all),
    baggage: baggageOf(read.node),
    state: read.folded.state,
    onMachine: read.folded.onMachine,
    enteredAt: read.folded.since === undefined ? undefined : nsToMs(read.folded.since),
    ended: read.folded.terminal,
    failure: read.folded.termination?.reason || undefined,
    transitions: transitionsOf(read.all),
    readings: readingsOf(read.node),
    childCount: read.children.length,
    subtreeNodes: own.nodes,
    subtreeLiveNodes: own.live,
    subtreeComputeMs: Number(own.computeNs / 1_000_000n),
    children: showChildren
      ? read.children.map((child) => panelNode(child, totals, expanded, false))
      : undefined,
  };
}

function kindOf(all: readonly RawTransition[]): BlockStatusPanelNode["kind"] {
  if (all.some((t) => t.namespace === ExecNamespace)) return "command";
  if (all.length > 0 && all.every((t) => t.namespace === WorkdirNamespace)) return "workdir";
  return "render";
}

function baggageOf(node: ActionContextNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node.getData() ?? {}))
    if (key !== "name") out[key] = typeof value === "string" ? value : JSON.stringify(value);
  return out;
}

function transitionsOf(all: readonly RawTransition[]): BlockStatusPanelTransition[] {
  return [...all]
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

function readingsOf(node: ActionContextNode): BlockStatusPanelReading[] {
  const out: BlockStatusPanelReading[] = [];
  for (const { key, value } of node.listKeyValuesAsString(ReadingPrefix)) {
    const parts = key.split("/");
    if (parts.length !== 4) continue;
    out.push({ namespace: parts[1], resource: parts[2], key: parts[3], value });
  }
  return out.sort(
    (a, b) =>
      a.namespace.localeCompare(b.namespace) ||
      a.resource.localeCompare(b.resource) ||
      a.key.localeCompare(b.key),
  );
}

/** The root's top-level nodes, ranked by each measure. A branch with nothing to rank is left out. */
function heaviest(root: Read, totals: Map<Read, Totals>): BlockStatusPanel["heaviest"] {
  const rank = (value: (t: Totals) => number): BlockStatusPanelBranch[] =>
    root.children
      .map((child) => ({
        contextId: child.node.id,
        name: nameOf(child),
        value: value(totals.get(child)!),
      }))
      .filter((b) => b.value > 0)
      .sort((a, b) => b.value - a.value || a.contextId.localeCompare(b.contextId))
      .slice(0, BlockStatusPanelHeaviestCount);

  return {
    byCompute: rank((t) => Number(t.computeNs / 1_000_000n)),
    byNodes: rank((t) => t.nodes),
    // No reporter writes file sizes yet.
    byFileSize: undefined,
  };
}
