/**
 * Folds a block's status-context tree into the {@link BlockStatusSummary} the Desktop App shows.
 *
 * The fold is a pure function over {@link StatusContextNode}, which both a synchronized tree
 * accessor and a test fixture satisfy. Everything it reads registers a watcher on the tree, so the
 * computable holding it re-runs when any context in the tree reports.
 *
 * See docs/text/work/projects/sdk/block-status/README_teo.md.
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
  /** Set when this context is a duplicate of another, which holds the computation it describes. */
  readonly originalId?: string;
  /** The context's immutable data: `name`, `block-pack`, `block-id`, `run-id`. */
  getData(): Record<string, unknown> | undefined;
  /** KV entries under a prefix, values as text. */
  listKeyValuesAsString(prefix?: string): { key: string; value: string }[];
  /** Field names, whatever their type: the children are `child/<rid>`. */
  listFields(): string[];
  /** The context a field points at, or undefined while the field is unset. */
  traverse(field: string): StatusContextNode | undefined;
}

/** How deep the walk follows `child/<rid>` before giving up. Guards against a malformed tree. */
const MaxDepth = 64;

/** Prefix of the field names holding child contexts. */
const ChildFieldPrefix = "child/";

/** KV key the backend sets once the render of a context has ended. */
const DoneKey = "done";

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

/** A node of the tree, reduced to what the summary needs. */
type FoldedNode = {
  /** True when the render of this context has ended. */
  terminal: boolean;
  /** The state holding this node, undefined when it is terminal or has not reported. */
  state?: BlockStatusState;
  /** When the node entered {@link state}, nanoseconds as a decimal string. */
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
 * The transitions of one context.
 *
 * A value that is not the JSON the backend writes, or that names a state this build does not
 * know, is skipped: a status report is diagnostic, and a newer backend reporting a state added
 * after this release must not break the surface.
 */
function readTransitions(node: StatusContextNode): Transition[] {
  const out: Transition[] = [];
  for (const { key, value } of node.listKeyValuesAsString("transition/")) {
    const parts = key.split("/");
    if (parts.length !== 4) continue;
    const [, topic, reporter, ns] = parts;
    if (ns === "" || !/^\d+$/.test(ns)) continue;

    let parsed: { state?: unknown; detail?: unknown; reason?: unknown };
    try {
      parsed = JSON.parse(value) as { state?: unknown; detail?: unknown; reason?: unknown };
    } catch {
      continue;
    }
    if (typeof parsed.state !== "string" || !knownStates.has(parsed.state)) continue;

    out.push({
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

/**
 * Reduces one context to {@link FoldedNode}.
 *
 * A context carries the reports of several reporters at once: the render reports under `render`,
 * and the commands and work dirs it created report under `exec` and `workdir`. The latest
 * transition of each reporter is that reporter's current state, and the state that holds the node
 * is the most recent one a reporter has not left.
 *
 * The node has ended when the backend says so, under topic `core` or with the `done` key. Those
 * are the backend's own writes on the render becoming final, and neither exists yet; until they
 * do, a node counts as ended once every one of its reporters has reached a terminal state.
 */
function foldNode(node: StatusContextNode, transitions: Transition[]): FoldedNode {
  const latestPerReporter = new Map<string, Transition>();
  let core: Transition | undefined;
  let holding: Transition | undefined;

  for (const t of transitions) {
    const reporterKey = `${t.topic}/${t.reporter}`;
    const previous = latestPerReporter.get(reporterKey);
    if (previous === undefined || compareNs(t.ns, previous.ns) > 0)
      latestPerReporter.set(reporterKey, t);
    if (t.topic === "core" && (core === undefined || compareNs(t.ns, core.ns) > 0)) core = t;
  }

  for (const t of latestPerReporter.values()) {
    if (isTerminalBlockStatusState(t.state)) continue;
    if (holding === undefined || compareNs(t.ns, holding.ns) > 0) holding = t;
  }

  const doneKeySet = node.listKeyValuesAsString(DoneKey).some(({ key }) => key === DoneKey);
  const coreTerminal = core !== undefined && isTerminalBlockStatusState(core.state);
  const allReportersTerminal =
    latestPerReporter.size > 0 &&
    [...latestPerReporter.values()].every((t) => isTerminalBlockStatusState(t.state));

  if (doneKeySet || coreTerminal || allReportersTerminal) return { terminal: true };

  if (holding === undefined) return { terminal: false };
  return {
    terminal: false,
    state: holding.state,
    since: holding.ns,
    detail: holding.detail === "" ? undefined : holding.detail,
  };
}

/** What the walk accumulates across the whole tree. */
type Accumulator = {
  totalNodes: number;
  liveNodes: number;
  /** Live nodes per state, with the earliest entry into it and the latest detail. */
  byState: Map<
    BlockStatusState,
    { nodes: number; since: string; detailNs?: string; detail?: string }
  >;
  terminatedNodes: number;
  /** The earliest termination reported anywhere, which is what the surface reports as the failure. */
  failure?: { ns: string; reason: string };
  firstNs?: string;
  lastNs?: string;
  /** The root's own fold, kept by the walk so the root is read once. */
  root?: FoldedNode;
};

function note(acc: Accumulator, node: StatusContextNode, isRoot: boolean): void {
  const transitions = readTransitions(node);

  for (const t of transitions) {
    if (acc.firstNs === undefined || compareNs(t.ns, acc.firstNs) < 0) acc.firstNs = t.ns;
    if (acc.lastNs === undefined || compareNs(t.ns, acc.lastNs) > 0) acc.lastNs = t.ns;
    if (t.state !== "Terminated") continue;
    if (acc.failure === undefined || compareNs(t.ns, acc.failure.ns) < 0)
      acc.failure = { ns: t.ns, reason: t.reason };
  }

  const folded = foldNode(node, transitions);
  if (isRoot) acc.root = folded;
  acc.totalNodes++;

  if (transitions.some((t) => t.state === "Terminated")) acc.terminatedNodes++;

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
 * The result aggregates by state rather than naming one node: a block that fans out over samples
 * is held by hundreds of operations at once, and the count is the diagnostic. A run that has
 * failed reports the failure as its line instead, since a reported termination is what the user
 * must act on.
 */
export function foldBlockStatus(root: StatusContextNode): BlockStatusSummary {
  const acc: Accumulator = {
    totalNodes: 0,
    liveNodes: 0,
    byState: new Map(),
    terminatedNodes: 0,
  };
  walk(root, acc, new Set(), 0);

  const data = root.getData();
  const runId = typeof data?.["run-id"] === "string" ? data["run-id"] : undefined;

  const byState: BlockStatusStateCount[] = [...acc.byState.entries()]
    .map(([state, group]) => ({
      state,
      phrase: blockStatusPhrases[state],
      nodes: group.nodes,
      since: nsToMs(group.since),
      detail: group.detail,
    }))
    // Most nodes first; the group held longest breaks a tie, so the order does not flicker
    // between two equal groups.
    .sort((a, b) => (b.nodes !== a.nodes ? b.nodes - a.nodes : a.since - b.since));

  return {
    runId,
    liveNodes: acc.liveNodes,
    totalNodes: acc.totalNodes,
    byState,
    line: deriveLine(acc, byState),
    startedAt: acc.firstNs === undefined ? undefined : nsToMs(acc.firstNs),
    lastChangeAt: acc.lastNs === undefined ? undefined : nsToMs(acc.lastNs),
    done: acc.root?.terminal ?? false,
    failure: acc.failure?.reason,
  };
}

/** The leading group as one line: a reported failure, else the state holding the most nodes. */
function deriveLine(
  acc: Accumulator,
  byState: readonly BlockStatusStateCount[],
): BlockStatusLine | undefined {
  if (acc.failure !== undefined)
    return {
      state: "Terminated",
      phrase: blockStatusPhrases.Terminated,
      nodes: acc.terminatedNodes,
      ofNodes: acc.totalNodes,
      heldSince: nsToMs(acc.failure.ns),
      reason: acc.failure.reason === "" ? undefined : acc.failure.reason,
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
