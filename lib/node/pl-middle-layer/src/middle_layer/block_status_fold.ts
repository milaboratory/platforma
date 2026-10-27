/**
 * Folds a block's action-context tree into the {@link BlockStatusSummary} the Desktop App shows.
 *
 * The fold is a pure function over {@link ActionContextNode}, which both a synchronized tree
 * accessor and a test fixture satisfy. Everything it reads registers a watcher on the tree, so the
 * computable holding it re-runs when any context in the tree reports.
 *
 * Source: docs/text/work/projects/sdk/block-status/README_teo.md.
 */

import type {
  BlockStatusLine,
  BlockStatusState,
  BlockStatusStateCount,
  BlockStatusSummary,
} from "@milaboratories/pl-model-middle-layer";
import {
  BlockStatusOnMachinePhrase,
  blockStatusPhrases,
  blockStatusStates,
  isTerminalBlockStatusState,
} from "@milaboratories/pl-model-middle-layer";

const knownStates = new Set<string>(blockStatusStates);

/** The part of an action context a fold reads. A tree node accessor satisfies it. */
export interface ActionContextNode {
  /** Stable identity of the context, for deduplicating a walk. */
  readonly id: string;
  /** The context's baggage: `name`, `block-pack`, `block-id`, `run-id`. */
  getData(): Record<string, unknown> | undefined;
  /** KV entries under a prefix, values as text. */
  listKeyValuesAsString(prefix: string): { key: string; value: string }[];
  /** Field names, whatever their type: the children are `child/<render>`. */
  listFields(): string[];
  /** The context a field points at, or undefined while the field is unset. */
  traverse(field: string): ActionContextNode | undefined;
}

/**
 * How deep the walk follows `child/<render>`.
 *
 * A stack guard, not a correctness device: the `seen` set already makes a cycle terminate, and the
 * depth of a real tree is the nesting depth of the templates, far below this.
 */
const MaxDepth = 256;

/** Prefix of the field names holding child contexts. */
const ChildFieldPrefix = "child/";

/** Prefix of the transition keys: `transition/<namespace>/<resource>/<ns>`. */
const TransitionPrefix = "transition/";

/** The namespace the workflow controller reports a render's own lifecycle under. */
const RenderNamespace = "render";

/** The namespace a command reports under; its `Running` means a job executing on a machine. */
const ExecNamespace = "exec";

/** One transition, as stored under `transition/<namespace>/<resource>/<ns>`. */
type Transition = {
  namespace: string;
  /** The resource that reported: the render itself, or a command or work dir it created. */
  reporter: string;
  /** The reporter's clock in nanoseconds, as the decimal string the key carries. */
  ns: string;
  state: BlockStatusState;
  detail: string;
  reason: string;
};

/** What one context reported. */
type ContextReports = {
  /** Transitions this build understands. */
  known: Transition[];
  /** The earliest and latest timestamp of ANY transition key, including states this build does
   * not know: the clock is state-independent, so an unknown state still means the run moved. */
  firstNs?: string;
  lastNs?: string;
};

/** A node of the tree, reduced to what the summary needs. */
type FoldedNode = {
  /** True when the render of this context has ended and nothing it started is still running. */
  terminal: boolean;
  /** Set when the render itself ended in a termination rather than a completion. */
  termination?: { ns: string; reason: string };
  /** The state holding this node, undefined when it is terminal or has not reported. */
  state?: BlockStatusState;
  /** True when {@link FoldedNode.state} is `Running` reported by a command. */
  onMachine: boolean;
  /** When the node entered its state, nanoseconds as a decimal string. */
  since?: string;
  detail?: string;
};

/** Compares non-negative decimal integers given as strings, shorter is smaller. */
function compareNs(a: string, b: string): number {
  return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;
}

/** Nanoseconds since the epoch, as the key carries them, to milliseconds. */
function nsToMs(ns: string): number {
  return Number(BigInt(ns) / 1_000_000n);
}

/** True for `Running` reported by a command executing on a machine. */
function isOnMachine(t: Transition): boolean {
  return t.state === "Running" && t.namespace === ExecNamespace;
}

/**
 * How strongly a report claims to be what holds a node.
 *
 * The render's own `Running` means only that template code is being evaluated, and the workflow
 * controller records it again on every evaluation, so it routinely carries a newer timestamp than
 * the wait that actually holds the node. Anything else outranks it however old it is, including a
 * command's `Running`, which is real work. Recency decides only between equal ranks.
 */
function rank(state: BlockStatusState, namespace: string): number {
  return state === "Running" && namespace === RenderNamespace ? 0 : 1;
}

/**
 * The transitions of one context.
 *
 * A value that is not the JSON the reporters write, or that names a state this build does not know,
 * is left out of the known list: a report is diagnostic, and a newer backend reporting a state
 * added after this release must not break the surface. Its timestamp still counts, because a report
 * arriving is evidence the run moved whatever the state means.
 */
function readTransitions(node: ActionContextNode): ContextReports {
  const out: ContextReports = { known: [] };

  for (const { key, value } of node.listKeyValuesAsString(TransitionPrefix)) {
    const parts = key.split("/");
    if (parts.length !== 4) continue;
    const [, namespace, reporter, ns] = parts;
    // Leading zeros would break the length-first comparison, and no reporter writes them.
    if (!/^(0|[1-9]\d*)$/.test(ns)) continue;

    if (out.firstNs === undefined || compareNs(ns, out.firstNs) < 0) out.firstNs = ns;
    if (out.lastNs === undefined || compareNs(ns, out.lastNs) > 0) out.lastNs = ns;

    let parsed: { state?: unknown; detail?: unknown; reason?: unknown };
    try {
      parsed = JSON.parse(value) as { state?: unknown; detail?: unknown; reason?: unknown };
    } catch {
      continue;
    }
    if (typeof parsed.state !== "string" || !knownStates.has(parsed.state)) continue;

    out.known.push({
      namespace,
      reporter,
      ns,
      // Checked against knownStates, which is built from the state names themselves.
      state: parsed.state as BlockStatusState,
      detail: typeof parsed.detail === "string" ? parsed.detail : "",
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    });
  }

  return out;
}

/**
 * Reduces one context to {@link FoldedNode}.
 *
 * A context carries the reports of several reporters: the render reports under `render`, and the
 * commands and work dirs it created report under `exec` and `workdir`. The latest transition of
 * each reporter is that reporter's current state, and the state holding the node is the strongest
 * of those a reporter has not left, see {@link rank}.
 *
 * The node has ended when the render has reported its own end (`Completed` once its outputs are
 * set, `Terminated` with its error, or `Completed` with detail `deduplicated`) and every other
 * reporter in the context has ended too: the render's outputs being set does not stop a command it
 * started, and that command's report must stay visible.
 */
function foldNode(transitions: readonly Transition[]): FoldedNode {
  const latestPerReporter = new Map<string, Transition>();
  for (const t of transitions) {
    const reporterKey = `${t.namespace}/${t.reporter}`;
    const previous = latestPerReporter.get(reporterKey);
    if (previous === undefined || compareNs(t.ns, previous.ns) > 0)
      latestPerReporter.set(reporterKey, t);
  }

  let render: Transition | undefined;
  let holding: Transition | undefined;
  let everyReporterEnded = true;
  for (const t of latestPerReporter.values()) {
    if (t.namespace === RenderNamespace) render = t;
    if (isTerminalBlockStatusState(t.state)) continue;
    everyReporterEnded = false;
    if (holding === undefined) {
      holding = t;
      continue;
    }
    const byRank = rank(t.state, t.namespace) - rank(holding.state, holding.namespace);
    if (byRank > 0 || (byRank === 0 && compareNs(t.ns, holding.ns) > 0)) holding = t;
  }

  if (render !== undefined && isTerminalBlockStatusState(render.state) && everyReporterEnded)
    return {
      terminal: true,
      onMachine: false,
      termination:
        render.state === "Terminated" ? { ns: render.ns, reason: render.reason } : undefined,
    };

  if (holding === undefined) return { terminal: false, onMachine: false };
  return {
    terminal: false,
    state: holding.state,
    onMachine: isOnMachine(holding),
    since: holding.ns,
    detail: holding.detail === "" ? undefined : holding.detail,
  };
}

/** A live group being accumulated. */
type Group = {
  state: BlockStatusState;
  onMachine: boolean;
  nodes: number;
  /** Earliest entry among the nodes currently in the group. */
  since: string;
  detailNs?: string;
  detail?: string;
};

/** What the walk accumulates across the whole tree. */
type Accumulator = {
  totalNodes: number;
  liveNodes: number;
  /** Keyed by state and onMachine, so the two `Running` groups stay apart. */
  groups: Map<string, Group>;
  firstNs?: string;
  lastNs?: string;
  /** The root's own fold, kept by the walk so the root is read once. */
  root?: FoldedNode;
};

function note(acc: Accumulator, node: ActionContextNode, isRoot: boolean): void {
  const reports = readTransitions(node);

  if (reports.firstNs !== undefined)
    if (acc.firstNs === undefined || compareNs(reports.firstNs, acc.firstNs) < 0)
      acc.firstNs = reports.firstNs;
  if (reports.lastNs !== undefined)
    if (acc.lastNs === undefined || compareNs(reports.lastNs, acc.lastNs) > 0)
      acc.lastNs = reports.lastNs;

  const folded = foldNode(reports.known);
  if (isRoot) acc.root = folded;
  acc.totalNodes++;

  if (folded.terminal) return;
  acc.liveNodes++;
  if (folded.state === undefined || folded.since === undefined) return;

  const key = `${folded.state}/${folded.onMachine}`;
  const group = acc.groups.get(key);
  if (group === undefined) {
    acc.groups.set(key, {
      state: folded.state,
      onMachine: folded.onMachine,
      nodes: 1,
      since: folded.since,
      detailNs: folded.detail === undefined ? undefined : folded.since,
      detail: folded.detail,
    });
    return;
  }

  group.nodes++;
  if (compareNs(folded.since, group.since) < 0) group.since = folded.since;
  if (
    folded.detail !== undefined &&
    (group.detailNs === undefined || compareNs(folded.since, group.detailNs) > 0)
  ) {
    group.detailNs = folded.since;
    group.detail = folded.detail;
  }
}

/** Walks the context and everything under it, depth first, each context counted once. */
function walk(node: ActionContextNode, acc: Accumulator, seen: Set<string>, depth: number): void {
  if (depth > MaxDepth) return;
  if (seen.has(node.id)) return;
  seen.add(node.id);

  note(acc, node, depth === 0);

  for (const fieldName of node.listFields()) {
    if (!fieldName.startsWith(ChildFieldPrefix)) continue;
    const child = node.traverse(fieldName);
    if (child === undefined) continue;
    walk(child, acc, seen, depth + 1);
  }
}

function phraseOf(group: { state: BlockStatusState; onMachine: boolean }): string {
  return group.onMachine ? BlockStatusOnMachinePhrase : blockStatusPhrases[group.state];
}

/**
 * The summary of a block run, from the root action context of its render.
 *
 * The counters are by state over live nodes, which is what the surface renders as one sentence.
 * The line names which of them holds the block, or reports the failure once the root render has
 * ended in one. A command that was terminated and retried does not take the line: while the root
 * render is live, what holds the block is whatever its live nodes are doing.
 */
export function foldBlockStatus(root: ActionContextNode): BlockStatusSummary {
  const acc: Accumulator = { totalNodes: 0, liveNodes: 0, groups: new Map() };
  walk(root, acc, new Set(), 0);

  const data = root.getData();
  const runId = typeof data?.["run-id"] === "string" ? data["run-id"] : undefined;

  const byState: BlockStatusStateCount[] = [...acc.groups.values()]
    // Most nodes first, since that is what holds most of the run. Then real work ahead of the
    // render's evaluation heartbeat, because on a tie the work is the more informative answer.
    // Then the group held longest, compared in nanoseconds because nsToMs truncates. Then the
    // state name, so the order is a function of the data and never of the walk's order.
    .sort(
      (a, b) =>
        b.nodes - a.nodes ||
        groupRank(b) - groupRank(a) ||
        compareNs(a.since, b.since) ||
        a.state.localeCompare(b.state) ||
        Number(a.onMachine) - Number(b.onMachine),
    )
    .map((group) => ({
      state: group.state,
      onMachine: group.onMachine,
      phrase: phraseOf(group),
      nodes: group.nodes,
      since: nsToMs(group.since),
      detail: group.detail,
    }));

  const rootFolded = acc.root;
  const failure =
    rootFolded?.terminal === true && rootFolded.termination !== undefined
      ? rootFolded.termination
      : undefined;

  return {
    availability: "read",
    runId,
    liveNodes: acc.liveNodes,
    totalNodes: acc.totalNodes,
    byState,
    line: deriveLine(acc, byState, failure),
    startedAt: acc.firstNs === undefined ? undefined : nsToMs(acc.firstNs),
    lastChangeAt: acc.lastNs === undefined ? undefined : nsToMs(acc.lastNs),
    // The root's outputs can be set while work it started still runs, so done needs both.
    done: (rootFolded?.terminal ?? false) && acc.liveNodes === 0,
    failure: failure === undefined || failure.reason === "" ? undefined : failure.reason,
  };
}

/** {@link rank} for a group: only the render's own `Running` is the heartbeat. */
function groupRank(group: { state: BlockStatusState; onMachine: boolean }): number {
  return group.state === "Running" && !group.onMachine ? 0 : 1;
}

/** The operation holding the block: the failure the run ended in, else the largest live group. */
function deriveLine(
  acc: Accumulator,
  byState: readonly BlockStatusStateCount[],
  failure: { ns: string; reason: string } | undefined,
): BlockStatusLine | undefined {
  if (failure !== undefined)
    return {
      state: "Terminated",
      onMachine: false,
      phrase: blockStatusPhrases.Terminated,
      nodes: 1,
      ofNodes: acc.liveNodes,
      heldSince: nsToMs(failure.ns),
      reason: failure.reason === "" ? undefined : failure.reason,
    };

  const leading = byState[0];
  if (leading === undefined) return undefined;

  return {
    state: leading.state,
    onMachine: leading.onMachine,
    phrase: leading.phrase,
    nodes: leading.nodes,
    ofNodes: acc.liveNodes,
    heldSince: leading.since,
    detail: leading.detail,
  };
}
