/**
 * Folds a block's status-context tree into the {@link BlockStatusSummary} the Desktop App shows.
 *
 * The fold is a pure function over {@link StatusContextNode}, which both a synchronized tree
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
  blockStatusPhrases,
  blockStatusStates,
  isTerminalBlockStatusState,
} from "@milaboratories/pl-model-middle-layer";
import type { BlockStatusState as ClientBlockStatusState } from "@milaboratories/pl-client";

/** The state names of the surface contract and of the wire must be the same set. */
const _stateNamesAgree: ClientBlockStatusState extends BlockStatusState
  ? BlockStatusState extends ClientBlockStatusState
    ? true
    : never
  : never = true;
void _stateNamesAgree;

const knownStates = new Set<string>(blockStatusStates);

/** The part of a status context a fold reads. A tree node accessor satisfies it. */
export interface StatusContextNode {
  /** Stable identity of the context, for deduplicating a walk. */
  readonly id: string;
  /** The context's immutable data: `name`, `block-pack`, `block-id`, `run-id`. */
  getData(): Record<string, unknown> | undefined;
  /** One KV value, for a key known in advance. */
  getValue(key: string): string | undefined;
  /** KV entries under a prefix, values as text. */
  listKeyValuesAsString(prefix: string): { key: string; value: string }[];
  /** Field names, whatever their type: the children are `child/<rid>`. */
  listFields(): string[];
  /** The context a field points at, or undefined while the field is unset. */
  traverse(field: string): StatusContextNode | undefined;
}

/**
 * How deep the walk follows `child/<rid>`.
 *
 * A stack guard, not a correctness device: the `seen` set already makes a cycle terminate, and the
 * depth of a real tree is the nesting depth of the templates, far below this.
 */
const MaxDepth = 256;

/** Prefix of the field names holding child contexts. */
const ChildFieldPrefix = "child/";

/** Prefix of the transition keys: `transition/<topic>/<resource>/<ns>`. */
const TransitionPrefix = "transition/";

/** KV key the backend sets once the render of a context has ended. */
const DoneKey = "done";

/** The topic the backend reports a render's own lifecycle under. */
const CoreTopic = "core";

/** One transition, as stored under `transition/<topic>/<resource>/<ns>`. */
type Transition = {
  topic: string;
  /** The resource that reported: the render itself, or a command or work dir it created. */
  reporter: string;
  /** Server clock in nanoseconds, as the decimal string the key carries. */
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
  /** True when the render of this context has ended. */
  terminal: boolean;
  /** Set when the node ended in a termination rather than a completion. */
  termination?: { ns: string; reason: string };
  /** The state holding this node, undefined when it is terminal or has not reported. */
  state?: BlockStatusState;
  /** When the node entered {@link FoldedNode.state}, nanoseconds as a decimal string. */
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

/**
 * How strongly a state claims to be what holds a node.
 *
 * `Running` means only that template code is being evaluated, and the workflow controller records
 * it again on every re-evaluation, so it routinely carries a newer timestamp than the wait that
 * actually holds the node. A wait therefore outranks it however old it is, and recency decides
 * only between two states of equal rank.
 */
function rank(state: BlockStatusState): number {
  return state === "Running" ? 0 : 1;
}

/**
 * The transitions of one context.
 *
 * A value that is not the JSON the backend writes, or that names a state this build does not know,
 * is left out of the known list: a status report is diagnostic, and a newer backend reporting a
 * state added after this release must not break the surface. Its timestamp still counts, because a
 * report arriving is evidence the run moved whatever the state means.
 */
function readTransitions(node: StatusContextNode): ContextReports {
  const out: ContextReports = { known: [] };

  for (const { key, value } of node.listKeyValuesAsString(TransitionPrefix)) {
    const parts = key.split("/");
    if (parts.length !== 4) continue;
    const [, topic, reporter, ns] = parts;
    // Leading zeros would break the length-first comparison, and the server never writes them.
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
      topic,
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

/** The transition a node ended in, when it ended in a termination rather than a completion. */
function terminationOf(
  core: Transition | undefined,
  transitions: readonly Transition[],
): Transition | undefined {
  if (core !== undefined && core.state === "Terminated") return core;

  let earliest: Transition | undefined;
  for (const t of transitions) {
    if (t.state !== "Terminated") continue;
    if (earliest === undefined || compareNs(t.ns, earliest.ns) < 0) earliest = t;
  }
  return earliest;
}

/**
 * Reduces one context to {@link FoldedNode}.
 *
 * A context carries the reports of several reporters at once: the render reports under `render`,
 * and the commands and work dirs it created report under `exec` and `workdir`. The latest
 * transition of each reporter is that reporter's current state, and the state holding the node is
 * the strongest of those a reporter has not left, see {@link rank}.
 *
 * The node has ended when the backend says so, under topic `core` or with the `done` key. Those
 * are the backend's own writes on the render becoming final.
 */
function foldNode(node: StatusContextNode, transitions: readonly Transition[]): FoldedNode {
  const latestPerReporter = new Map<string, Transition>();
  let core: Transition | undefined;
  let holding: Transition | undefined;

  for (const t of transitions) {
    const reporterKey = `${t.topic}/${t.reporter}`;
    const previous = latestPerReporter.get(reporterKey);
    if (previous === undefined || compareNs(t.ns, previous.ns) > 0)
      latestPerReporter.set(reporterKey, t);
    if (t.topic === CoreTopic && (core === undefined || compareNs(t.ns, core.ns) > 0)) core = t;
  }

  for (const t of latestPerReporter.values()) {
    if (isTerminalBlockStatusState(t.state)) continue;
    if (holding === undefined) {
      holding = t;
      continue;
    }
    const byRank = rank(t.state) - rank(holding.state);
    if (byRank > 0 || (byRank === 0 && compareNs(t.ns, holding.ns) > 0)) holding = t;
  }

  const done = node.getValue(DoneKey) !== undefined;
  const coreTerminal = core !== undefined && isTerminalBlockStatusState(core.state);

  if (done || coreTerminal) {
    const terminated = terminationOf(core, transitions);
    return {
      terminal: true,
      termination:
        terminated === undefined ? undefined : { ns: terminated.ns, reason: terminated.reason },
    };
  }

  if (holding === undefined) return { terminal: false };
  return {
    terminal: false,
    state: holding.state,
    since: holding.ns,
    detail: holding.detail === "" ? undefined : holding.detail,
  };
}

/** A live group being accumulated. */
type Group = {
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
  byState: Map<BlockStatusState, Group>;
  firstNs?: string;
  lastNs?: string;
  /** The root's own fold, kept by the walk so the root is read once. */
  root?: FoldedNode;
};

function note(acc: Accumulator, node: StatusContextNode, isRoot: boolean): void {
  const reports = readTransitions(node);

  if (reports.firstNs !== undefined)
    if (acc.firstNs === undefined || compareNs(reports.firstNs, acc.firstNs) < 0)
      acc.firstNs = reports.firstNs;
  if (reports.lastNs !== undefined)
    if (acc.lastNs === undefined || compareNs(reports.lastNs, acc.lastNs) > 0)
      acc.lastNs = reports.lastNs;

  const folded = foldNode(node, reports.known);
  if (isRoot) acc.root = folded;
  acc.totalNodes++;

  if (folded.terminal) return;
  acc.liveNodes++;
  if (folded.state === undefined || folded.since === undefined) return;

  const group = acc.byState.get(folded.state);
  if (group === undefined) {
    acc.byState.set(folded.state, {
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
function walk(node: StatusContextNode, acc: Accumulator, seen: Set<string>, depth: number): void {
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

/**
 * The summary of a block run, from the root status context of its render.
 *
 * The counters are by state over live nodes, which is what the surface renders as one sentence.
 * The line names which of them holds the block, or reports the failure once the run has ended in
 * one. A termination the run recovered from does not take the line: while the root render is still
 * live, what holds the block is whatever its live nodes are doing.
 */
export function foldBlockStatus(root: StatusContextNode): BlockStatusSummary {
  const acc: Accumulator = { totalNodes: 0, liveNodes: 0, byState: new Map() };
  walk(root, acc, new Set(), 0);

  const data = root.getData();
  const runId = typeof data?.["run-id"] === "string" ? data["run-id"] : undefined;

  const byState: BlockStatusStateCount[] = [...acc.byState.entries()]
    .map(([state, group]) => ({ state, group }))
    // Most nodes first, since that is what holds most of the run. Then a wait ahead of the
    // evaluation heartbeat, because on a tie the wait is the more informative answer. Then the
    // group held longest, compared in nanoseconds because nsToMs truncates and two groups can
    // differ by less than a millisecond. Then the state name, so the order is a function of the
    // data and never of the order the walk happened to see it.
    .sort(
      (a, b) =>
        b.group.nodes - a.group.nodes ||
        rank(b.state) - rank(a.state) ||
        compareNs(a.group.since, b.group.since) ||
        a.state.localeCompare(b.state),
    )
    .map(({ state, group }) => ({
      state,
      phrase: blockStatusPhrases[state],
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
    done: rootFolded?.terminal ?? false,
    failure: failure === undefined || failure.reason === "" ? undefined : failure.reason,
  };
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
    phrase: leading.phrase,
    nodes: leading.nodes,
    ofNodes: acc.liveNodes,
    heldSince: leading.since,
    detail: leading.detail,
  };
}
