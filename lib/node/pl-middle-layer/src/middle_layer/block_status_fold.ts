/**
 * Folds a block's action-context tree into the {@link BlockStatusSummary} the Desktop App shows.
 *
 * The fold is a pure function over {@link ActionContextNode}, which both a synchronized tree
 * accessor and a test fixture satisfy. Everything it reads registers a watcher on the tree, so the
 * computable holding it re-runs when any context in the tree reports.
 */

import type {
  BlockStatusJobs,
  BlockStatusState,
  BlockStatusSummary,
} from "@milaboratories/pl-model-middle-layer";
import {
  isBlockStatusState,
  isTerminalBlockStatusState,
} from "@milaboratories/pl-model-middle-layer";

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

/**
 * The namespace the creator of a context reports under. The middle layer records `Terminated` here
 * on the root when the user stops the run, see `recordBlockRunCancelled`.
 */
const CreatorNamespace = "core";

/** The namespace a command reports under; its `Running` means a job executing on a machine. */
const ExecNamespace = "exec";

/** The namespace a job's work folder reports under: staging inputs, saving results. */
export const WorkdirNamespace = "workdir";

/** Prefix of a work folder's readings: `reading/workdir/<resource>/<key>`. */
const WorkdirReadingPrefix = "reading/workdir/";

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
  /** The reason, set when the render itself ended in a termination rather than a completion. */
  failure?: string;
  /** The state holding this node, undefined when it is terminal or has not reported. */
  state?: BlockStatusState;
  /** True when {@link FoldedNode.state} is `Running` reported by a command. */
  onMachine: boolean;
  /** When the node entered its state, nanoseconds as a decimal string. */
  since?: string;
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
    const state = parsed.state;
    if (!isBlockStatusState(state)) continue;

    out.known.push({
      namespace,
      reporter,
      ns,
      state,
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
      failure: render.state === "Terminated" ? render.reason : undefined,
    };

  if (holding === undefined) return { terminal: false, onMachine: false };
  return {
    terminal: false,
    state: holding.state,
    onMachine: holding.state === "Running" && holding.namespace === ExecNamespace,
    since: holding.ns,
  };
}

/** What the walk accumulates across the whole tree. */
type Accumulator = {
  totalNodes: number;
  liveNodes: number;
  firstNs?: string;
  lastNs?: string;
  /** The root's own fold, kept by the walk so the root is read once. */
  root?: FoldedNode;
  /** The earliest render anywhere in the tree whose latest report is a termination. */
  failure?: { reason: string; ns: string };
  /** When the creator marked the run cancelled on the root. */
  cancelledNs?: string;
  jobs: JobAccumulator;
};

/** {@link BlockStatusJobs} being accumulated, the earliest entries still in nanoseconds. */
type JobAccumulator = {
  -readonly [K in Exclude<keyof BlockStatusJobs, "queuedSince" | "pendingSince" | "files">]: number;
} & {
  queuedSinceNs?: string;
  pendingSinceNs?: string;
  filesDone: number;
  filesTotal: number;
  /** Whether any copying job has reported its progress. */
  filesKnown: boolean;
};

function emptyJobAccumulator(): JobAccumulator {
  return {
    total: 0,
    done: 0,
    failed: 0,
    running: 0,
    copying: 0,
    queued: 0,
    pending: 0,
    saving: 0,
    filesDone: 0,
    filesTotal: 0,
    filesKnown: false,
  };
}

/** True for a context a command or its work folder reports in: one job. */
function isJob(reports: ContextReports): boolean {
  return reports.known.some(
    (t) => t.namespace === ExecNamespace || t.namespace === WorkdirNamespace,
  );
}

function earlier(a: string | undefined, b: string): string {
  return a === undefined || compareNs(b, a) < 0 ? b : a;
}

/** The progress readings of the work folders in a context, summed: files done of all. */
function readWorkdirProgress(node: ActionContextNode): { done: number; total: number } | undefined {
  let done = 0;
  let total = 0;
  let known = false;
  for (const { key, value } of node.listKeyValuesAsString(WorkdirReadingPrefix)) {
    if (!key.endsWith("/progress")) continue;
    let parsed: { done?: unknown; total?: unknown };
    try {
      parsed = JSON.parse(value) as { done?: unknown; total?: unknown };
    } catch {
      continue;
    }
    if (typeof parsed.done !== "number" || typeof parsed.total !== "number") continue;
    done += parsed.done;
    total += parsed.total;
    known = true;
  }
  return known ? { done, total } : undefined;
}

/** Counts one job where it is now. */
function noteJob(jobs: JobAccumulator, node: ActionContextNode, folded: FoldedNode): void {
  jobs.total++;
  if (folded.terminal) {
    if (folded.failure !== undefined) jobs.failed++;
    else jobs.done++;
    return;
  }
  switch (folded.state) {
    case "Running":
      // The render's own Running only evaluates template code; the job has not started yet.
      if (folded.onMachine) jobs.running++;
      return;
    case "WaitingWorkdirGate":
    case "PopulatingWorkdir": {
      jobs.copying++;
      const progress = readWorkdirProgress(node);
      if (progress === undefined) return;
      jobs.filesDone += progress.done;
      jobs.filesTotal += progress.total;
      jobs.filesKnown = true;
      return;
    }
    case "WaitingSubmissionGate":
      jobs.queued++;
      if (folded.since !== undefined)
        jobs.queuedSinceNs = earlier(jobs.queuedSinceNs, folded.since);
      return;
    case "WaitingForScheduler":
    case "WaitingForMachine":
      jobs.pending++;
      if (folded.since !== undefined)
        jobs.pendingSinceNs = earlier(jobs.pendingSinceNs, folded.since);
      return;
    case "CollectingOutputs":
      jobs.saving++;
      return;
    default:
      return;
  }
}

function finishJobs(jobs: JobAccumulator): BlockStatusJobs {
  const { queuedSinceNs, pendingSinceNs, filesDone, filesTotal, filesKnown, ...counts } = jobs;
  return {
    ...counts,
    queuedSince: queuedSinceNs === undefined ? undefined : nsToMs(queuedSinceNs),
    pendingSince: pendingSinceNs === undefined ? undefined : nsToMs(pendingSinceNs),
    files: filesKnown ? { done: filesDone, total: filesTotal } : undefined,
  };
}

function note(acc: Accumulator, node: ActionContextNode, isRoot: boolean): void {
  const reports = readTransitions(node);

  if (reports.firstNs !== undefined)
    if (acc.firstNs === undefined || compareNs(reports.firstNs, acc.firstNs) < 0)
      acc.firstNs = reports.firstNs;
  if (reports.lastNs !== undefined)
    if (acc.lastNs === undefined || compareNs(reports.lastNs, acc.lastNs) > 0)
      acc.lastNs = reports.lastNs;

  const folded = foldNode(reports.known);
  if (isRoot) {
    acc.root = folded;
    for (const t of reports.known)
      if (t.namespace === CreatorNamespace && t.state === "Terminated")
        if (acc.cancelledNs === undefined || compareNs(t.ns, acc.cancelledNs) > 0)
          acc.cancelledNs = t.ns;
  }
  acc.totalNodes++;
  if (isJob(reports)) noteJob(acc.jobs, node, folded);

  const render = latestRender(reports.known);
  if (render?.state === "Terminated")
    if (acc.failure === undefined || compareNs(render.ns, acc.failure.ns) < 0)
      acc.failure = { reason: render.reason, ns: render.ns };

  if (!folded.terminal) acc.liveNodes++;
}

/** Where the backend nests the error of an input inside the error of what consumes it. */
const InputErrorMarker = "has input errors:";

/** Wrappers the workflow controller puts in front of a template's own error. */
const TemplateErrorPrefix = /^(cannot eval code: |cannot eval template: |tengo template error: )+/;

/** Longest headline, in characters. */
const MaxHeadlineLength = 200;

/**
 * The innermost message of a termination reason, for a title: the backend wraps the error of each
 * input in the error of its consumer, and tengo appends stack frames, so a reason can run to pages.
 */
export function failureHeadline(reason: string): string {
  const marker = reason.lastIndexOf(InputErrorMarker);
  const lines = reason
    .slice(marker < 0 ? 0 : marker + InputErrorMarker.length)
    .split("\n")
    .map((line) => line.trim())
    // Stack frames: `@platforma-sdk/workflow-tengo:tpl.base:595:5`.
    .filter((line) => line !== "" && !/^@\S+:\d+:\d+$/.test(line));

  const error = lines.find((line) => line.startsWith("Error: "));
  const command = lines.find((line) => line.startsWith("Command name: "));
  const headline =
    error !== undefined && command !== undefined
      ? `${command.slice("Command name: ".length).replaceAll('"', "")} failed: ${error.slice("Error: ".length)}`
      : lines.join(" ").replace(TemplateErrorPrefix, "");
  return headline.length > MaxHeadlineLength
    ? `${headline.slice(0, MaxHeadlineLength - 1)}…`
    : headline;
}

/** The render's own latest transition in a context. */
function latestRender(known: readonly Transition[]): Transition | undefined {
  let latest: Transition | undefined;
  for (const t of known)
    if (t.namespace === RenderNamespace && (latest === undefined || compareNs(t.ns, latest.ns) > 0))
      latest = t;
  return latest;
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

/** The summary of a block run, from the root action context of its render. */
export function foldBlockStatus(root: ActionContextNode): BlockStatusSummary {
  const acc: Accumulator = { totalNodes: 0, liveNodes: 0, jobs: emptyJobAccumulator() };
  walk(root, acc, new Set(), 0);

  const runId = root.getData()?.["run-id"];
  const summary = {
    availability: "read" as const,
    runId: typeof runId === "string" ? runId : undefined,
    liveNodes: acc.liveNodes,
    totalNodes: acc.totalNodes,
    jobs: finishJobs(acc.jobs),
    startedAt: acc.firstNs === undefined ? undefined : nsToMs(acc.firstNs),
  };

  // A stopped run: its render is gone and reports nothing more, so the tree is frozen where it
  // stopped. The counters stay, to say where each node was; the run itself is over.
  if (acc.cancelledNs !== undefined)
    return { ...summary, lastChangeAt: nsToMs(acc.cancelledNs), done: true, cancelled: true };

  // A terminated render fails the run. Renders waiting on its outputs never report again, so once
  // no job is working the run is over even though they still look live.
  const { jobs } = summary;
  const working = jobs.running + jobs.copying + jobs.queued + jobs.pending + jobs.saving;
  return {
    ...summary,
    lastChangeAt: acc.lastNs === undefined ? undefined : nsToMs(acc.lastNs),
    // The root's outputs can be set while work it started still runs, so done needs both.
    done:
      ((acc.root?.terminal ?? false) && acc.liveNodes === 0) ||
      (acc.failure !== undefined && working === 0),
    failure: acc.failure === undefined ? undefined : failureHeadline(acc.failure.reason),
  };
}
