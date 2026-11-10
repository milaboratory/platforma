/**
 * Folds a block's action-context tree into the {@link BlockStatusSummary} the Desktop App shows.
 *
 * The fold runs bottom up: {@link foldContext} reads one context on its own, and
 * {@link mergeSubtree} merges it with the folds of its children. Over a synchronized tree each
 * context gets its own computable (see `block_status_tree.ts`), so a report re-reads only the
 * context it landed in and re-merges the contexts above it; the rest of the tree is not read
 * again.
 *
 * The fold attaches no meaning to the states the reporters write, beyond the lifecycle the backend
 * fixes: a context ends in `Completed` or `Terminated`, and a command's `Running` is work on a
 * machine. Jobs are counted per state as reported, so a state added on the backend reaches the
 * Desktop App without a middle layer release.
 */

import type {
  BlockStatusJobGroup,
  BlockStatusJobs,
  BlockStatusSummary,
} from "@milaboratories/pl-model-middle-layer";
import {
  blockStatusStatesRecord,
  isTerminalBlockStatusState,
} from "@milaboratories/pl-model-middle-layer";

/**
 * A key-value written as a JSON object, with its fields unchecked; undefined for anything else.
 * A reporter may write any JSON, so `null` or a bare number must not reach a field read.
 */
function parseJsonObject(value: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  return Object.fromEntries(Object.entries(parsed));
}

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
 * How deep the fold follows `child/<render>`.
 *
 * A stack guard, not a correctness device: a context already on the path is skipped, and the depth
 * of a real tree is the nesting depth of the templates, far below this.
 */
export const MaxDepth = 256;

/** Prefix of the field names holding child contexts. */
const ChildFieldPrefix = "child/";

/** Prefix of the transition keys: `transition/<namespace>/<resource>/<ns>`. */
const TransitionPrefix = "transition/";

/** Prefix of the reading keys: `reading/<namespace>/<resource>/<key>`. */
const ReadingPrefix = "reading/";

/** The namespace the workflow controller reports a render's own lifecycle under. */
const RenderNamespace = "render";

/**
 * The namespace the creator of a context reports under. The middle layer records `Terminated` here
 * on the root when the user stops the run, see `recordBlockRunCancelled`.
 */
const CreatorNamespace = "core";

/** The namespace a command reports under; its `Running` means a job executing on a machine. */
export const ExecNamespace = "exec";

/** The namespace a job's work folder reports under. */
export const WorkdirNamespace = "workdir";

/** One transition, as stored under `transition/<namespace>/<resource>/<ns>`. */
export type Transition = {
  namespace: string;
  /** The resource that reported: the render itself, or a command or work dir it created. */
  reporter: string;
  /** The reporter's clock in nanoseconds, as the decimal string the key carries. */
  ns: string;
  /** As the reporter wrote it, whether or not this build knows the name. */
  state: string;
  detail: string;
  reason: string;
};

/** What one context reported. */
export type ContextReports = {
  /** Every transition whose key and value parse. */
  all: Transition[];
  /** The earliest and latest timestamp of any transition key, even one whose value does not
   * parse: a report arriving is evidence the run moved whatever it says. */
  firstNs?: string;
  lastNs?: string;
};

/** A node of the tree, reduced to what the summary needs. */
export type FoldedNode = {
  /** True when the render of this context has ended and nothing it started is still running. */
  terminal: boolean;
  /** The reason, set when the render itself ended in a termination rather than a completion. */
  failure?: string;
  /** The transition holding this node, undefined when it is terminal or has not reported. */
  holding?: Transition;
  /** True when {@link FoldedNode.holding} is `Running` reported by a command. */
  onMachine: boolean;
};

/** Compares non-negative decimal integers given as strings, shorter is smaller. */
export function compareNs(a: string, b: string): number {
  return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;
}

/** Nanoseconds since the epoch, as the key carries them, to milliseconds. */
export function nsToMs(ns: string): number {
  return Number(BigInt(ns) / 1_000_000n);
}

function earlier(a: string | undefined, b: string | undefined): string | undefined {
  return a === undefined || (b !== undefined && compareNs(b, a) < 0) ? b : a;
}

function later(a: string | undefined, b: string | undefined): string | undefined {
  return a === undefined || (b !== undefined && compareNs(b, a) > 0) ? b : a;
}

/**
 * How strongly a report claims to be what holds a node.
 *
 * The render's own `Running` means only that template code is being evaluated, and the workflow
 * controller records it again on every evaluation, so it routinely carries a newer timestamp than
 * the wait that actually holds the node. Anything else outranks it however old it is, including a
 * command's `Running`, which is real work. Recency decides only between equal ranks.
 */
function rank(t: Transition): number {
  return t.state === blockStatusStatesRecord.Running && t.namespace === RenderNamespace ? 0 : 1;
}

/**
 * The transitions of one context.
 *
 * A value that is not the JSON the reporters write is left out: a report is diagnostic, and a
 * malformed one must not break the surface. Its timestamp still counts.
 */
export function readTransitions(node: ActionContextNode): ContextReports {
  const out: ContextReports = { all: [] };

  for (const { key, value } of node.listKeyValuesAsString(TransitionPrefix)) {
    const parts = key.split("/");
    if (parts.length !== 4) continue;
    const [, namespace, reporter, ns] = parts;
    // Leading zeros would break the length-first comparison, and no reporter writes them.
    if (!/^(0|[1-9]\d*)$/.test(ns)) continue;

    out.firstNs = earlier(out.firstNs, ns);
    out.lastNs = later(out.lastNs, ns);

    const parsed = parseJsonObject(value);
    if (parsed === undefined) continue;
    const state = parsed.state;
    if (typeof state !== "string") continue;
    const detail = typeof parsed.detail === "string" ? parsed.detail : "";
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    out.all.push({ namespace, reporter, ns, state, detail, reason });
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
export function foldNode(transitions: readonly Transition[]): FoldedNode {
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
    const byRank = rank(t) - rank(holding);
    if (byRank > 0 || (byRank === 0 && compareNs(t.ns, holding.ns) > 0)) holding = t;
  }

  if (render !== undefined && isTerminalBlockStatusState(render.state) && everyReporterEnded)
    return {
      terminal: true,
      onMachine: false,
      failure: render.state === blockStatusStatesRecord.Terminated ? render.reason : undefined,
    };

  return {
    terminal: false,
    holding,
    onMachine:
      holding?.state === blockStatusStatesRecord.Running && holding.namespace === ExecNamespace,
  };
}

/** The render's own latest transition in a context. */
export function latestRender(transitions: readonly Transition[]): Transition | undefined {
  let latest: Transition | undefined;
  for (const t of transitions)
    if (t.namespace === RenderNamespace && (latest === undefined || compareNs(t.ns, latest.ns) > 0))
      latest = t;
  return latest;
}

/** One reading, as stored under `reading/<namespace>/<resource>/<key>`. */
export type Reading = { namespace: string; resource: string; key: string; value: string };

/** One context read on its own, before its children are merged in. */
export type ContextFold = {
  readonly id: string;
  /** The baggage: `name`, `block-pack`, `block-id`, `run-id`. */
  readonly data: Record<string, unknown> | undefined;
  readonly reports: ContextReports;
  readonly readings: readonly Reading[];
  readonly folded: FoldedNode;
  /** True for a context a command or its work folder reports in: one job. */
  readonly job: boolean;
  /** The render's own latest transition, when it is a termination. */
  readonly terminated?: { readonly reason: string; readonly ns: string };
  /** Time its commands spent in `Running`, see {@link computeOf}. */
  readonly compute: ContextCompute;
};

/**
 * Time the commands of a context spent in `Running`: each Running up to the reporter's next
 * transition, ns. A command whose latest transition is Running is still open; it is counted up to
 * whatever moment the reader picks.
 */
export type ContextCompute = {
  readonly closedNs: bigint;
  /** When each command still running started, ns. */
  readonly openSinceNs: readonly string[];
};

function computeOf(all: readonly Transition[]): ContextCompute {
  const byReporter = new Map<string, Transition[]>();
  for (const t of all) {
    if (t.namespace !== ExecNamespace) continue;
    const list = byReporter.get(t.reporter);
    if (list === undefined) byReporter.set(t.reporter, [t]);
    else list.push(t);
  }

  let closedNs = 0n;
  const openSinceNs: string[] = [];
  for (const list of byReporter.values()) {
    list.sort((a, b) => compareNs(a.ns, b.ns));
    for (let i = 0; i < list.length; i++) {
      if (list[i].state !== blockStatusStatesRecord.Running) continue;
      const next = list[i + 1];
      if (next === undefined) openSinceNs.push(list[i].ns);
      else closedNs += BigInt(next.ns) - BigInt(list[i].ns);
    }
  }
  return { closedNs, openSinceNs };
}

function readReadings(node: ActionContextNode): Reading[] {
  const out: Reading[] = [];
  for (const { key, value } of node.listKeyValuesAsString(ReadingPrefix)) {
    const parts = key.split("/");
    if (parts.length !== 4) continue;
    out.push({ namespace: parts[1], resource: parts[2], key: parts[3], value });
  }
  return out;
}

/** Reads one context: its transitions, its readings, and the state holding it. */
export function foldContext(node: ActionContextNode): ContextFold {
  const reports = readTransitions(node);
  const render = latestRender(reports.all);
  return {
    id: node.id,
    data: node.getData(),
    reports,
    readings: readReadings(node),
    folded: foldNode(reports.all),
    job: reports.all.some((t) => t.namespace === ExecNamespace || t.namespace === WorkdirNamespace),
    terminated:
      render?.state === blockStatusStatesRecord.Terminated
        ? { reason: render.reason, ns: render.ns }
        : undefined,
    compute: computeOf(reports.all),
  };
}

/** {@link BlockStatusJobGroup} being accumulated, its timestamp still in nanoseconds. */
type JobGroupTally = {
  readonly namespace: string;
  readonly state: string;
  readonly count: number;
  readonly sinceNs?: string;
  readonly files?: { readonly done: number; readonly total: number };
};

/**
 * {@link BlockStatusJobs} being accumulated over a subtree. Plain data throughout, no `Map`: it is
 * the value of a computable, which the computable types map over field by field.
 */
export type JobTally = {
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  /** Jobs not ended, by `<namespace>/<state>` of the transition holding each. */
  readonly groups: Readonly<Record<string, JobGroupTally>>;
};

const EmptyJobTally: JobTally = { total: 0, done: 0, failed: 0, groups: {} };

/** A context and everything under it, folded. */
export type SubtreeFold = {
  readonly own: ContextFold;
  readonly children: readonly SubtreeFold[];
  /** This context and every context under it. */
  readonly contexts: number;
  /** Contexts in the subtree that have not ended. */
  readonly activeContexts: number;
  readonly firstNs?: string;
  readonly lastNs?: string;
  /**
   * The earliest render in the subtree whose latest report is a termination, with the context ids
   * from this context down to it.
   */
  readonly failure?: {
    readonly reason: string;
    readonly ns: string;
    readonly path: readonly string[];
  };
  readonly jobs: JobTally;
  /**
   * Time the subtree's commands spent in `Running`. Commands still running add their time up to a
   * moment the reader picks: `open × now − openSinceSumNs`.
   */
  readonly compute: {
    readonly closedNs: bigint;
    readonly open: number;
    readonly openSinceSumNs: bigint;
  };
};

/** Files done of all, summed over the work folders' progress readings of one context. */
function workdirProgress(readings: readonly Reading[]): JobGroupTally["files"] {
  let progress: JobGroupTally["files"];
  for (const r of readings) {
    if (r.namespace !== WorkdirNamespace || r.key !== "progress") continue;
    const parsed = parseJsonObject(r.value);
    if (typeof parsed?.done !== "number" || typeof parsed.total !== "number") continue;
    progress = addFiles(progress, { done: parsed.done, total: parsed.total });
  }
  return progress;
}

function addFiles(a: JobGroupTally["files"], b: JobGroupTally["files"]): JobGroupTally["files"] {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return { done: a.done + b.done, total: a.total + b.total };
}

function groupKey(group: Pick<JobGroupTally, "namespace" | "state">): string {
  return `${group.namespace}/${group.state}`;
}

function mergeGroup(
  groups: Record<string, JobGroupTally>,
  key: string,
  group: JobGroupTally,
): void {
  const previous = groups[key];
  groups[key] =
    previous === undefined
      ? group
      : {
          namespace: group.namespace,
          state: group.state,
          count: previous.count + group.count,
          sinceNs: earlier(previous.sinceNs, group.sinceNs),
          files: addFiles(previous.files, group.files),
        };
}

/** The job a context is, counted where it is now; empty when it is not one. */
function ownJobs(own: ContextFold): JobTally {
  if (!own.job) return EmptyJobTally;
  const { terminal, failure, holding } = own.folded;
  if (terminal)
    return failure === undefined
      ? { ...EmptyJobTally, total: 1, done: 1 }
      : { ...EmptyJobTally, total: 1, failed: 1 };
  if (holding === undefined) return { ...EmptyJobTally, total: 1 };
  const group: JobGroupTally = {
    namespace: holding.namespace,
    state: holding.state,
    count: 1,
    sinceNs: holding.ns,
    files: workdirProgress(own.readings),
  };
  return { ...EmptyJobTally, total: 1, groups: { [groupKey(group)]: group } };
}

/**
 * Merges a context with the folds of its children. One pass over the direct children, so a report
 * re-merges each context on its path to the root and nothing else.
 */
export function mergeSubtree(own: ContextFold, children: readonly SubtreeFold[]): SubtreeFold {
  let contexts = 1;
  let activeContexts = own.folded.terminal ? 0 : 1;
  let firstNs = own.reports.firstNs;
  let lastNs = own.reports.lastNs;
  let failure: SubtreeFold["failure"] =
    own.terminated === undefined ? undefined : { ...own.terminated, path: [own.id] };
  let failedBelow = false;
  let closedNs = own.compute.closedNs;
  let open = own.compute.openSinceNs.length;
  let openSinceSumNs = 0n;
  for (const since of own.compute.openSinceNs) openSinceSumNs += BigInt(since);

  const self = ownJobs(own);
  let { total, done, failed } = self;
  const groups: Record<string, JobGroupTally> = { ...self.groups };

  for (const child of children) {
    contexts += child.contexts;
    activeContexts += child.activeContexts;
    firstNs = earlier(firstNs, child.firstNs);
    lastNs = later(lastNs, child.lastNs);
    if (child.failure !== undefined) {
      failedBelow = true;
      if (failure === undefined || compareNs(child.failure.ns, failure.ns) < 0)
        failure = { ...child.failure, path: [own.id, ...child.failure.path] };
    }
    closedNs += child.compute.closedNs;
    open += child.compute.open;
    openSinceSumNs += child.compute.openSinceSumNs;
    total += child.jobs.total;
    done += child.jobs.done;
    failed += child.jobs.failed;
    for (const [key, group] of Object.entries(child.jobs.groups)) mergeGroup(groups, key, group);
  }

  // A render that failed on its own, e.g. one whose command could not start, is a failed job too;
  // one that only passes up the failure under it is not counted again.
  if (own.terminated !== undefined && !failedBelow && !own.job) {
    total++;
    failed++;
  }

  return {
    own,
    children,
    contexts,
    activeContexts,
    firstNs,
    lastNs,
    failure,
    jobs: { total, done, failed, groups },
    compute: { closedNs, open, openSinceSumNs },
  };
}

/**
 * The child contexts a fold follows: each once, and none already on the path from the root, so a
 * context linked twice or a cycle cannot count a subtree again.
 */
export function childContexts<T extends { readonly id: unknown }>(
  fields: readonly string[],
  traverse: (field: string) => T | undefined,
  path: ReadonlySet<string>,
): T[] {
  if (path.size > MaxDepth) return [];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    if (!field.startsWith(ChildFieldPrefix)) continue;
    const child = traverse(field);
    if (child === undefined) continue;
    const id = String(child.id);
    if (path.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(child);
  }
  return out;
}

/**
 * Folds a context and everything under it in one walk: what the per-context computables compute,
 * for a tree that is read once.
 */
export function foldSubtree(
  node: ActionContextNode,
  path: ReadonlySet<string> = new Set(),
): SubtreeFold {
  const below = new Set(path).add(node.id);
  const children = childContexts(node.listFields(), (f) => node.traverse(f), below);
  return mergeSubtree(
    foldContext(node),
    children.map((child) => foldSubtree(child, below)),
  );
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

  const text = lines.join(" ");
  // A command that failed: `Command ID: … Command name: "python" … Error: docker is not set`.
  const command = /Command name: "([^"]*)".*\bError: (.+)$/.exec(text);
  const headline =
    command !== null
      ? `${command[1]} failed: ${command[2]}`
      : text.replace(TemplateErrorPrefix, "");
  return headline.length > MaxHeadlineLength
    ? `${headline.slice(0, MaxHeadlineLength - 1)}…`
    : headline;
}

function finishJobs(jobs: JobTally): BlockStatusJobs {
  const byState = Object.values(jobs.groups)
    .map((g): BlockStatusJobGroup => ({
      namespace: g.namespace,
      state: g.state,
      count: g.count,
      since: g.sinceNs === undefined ? undefined : nsToMs(g.sinceNs),
      files: g.files,
    }))
    .sort((a, b) => b.count - a.count || groupKey(a).localeCompare(groupKey(b)));
  return { total: jobs.total, done: jobs.done, failed: jobs.failed, byState };
}

/** The summary of a block run, from the fold of its root action context. */
export function summarize(root: SubtreeFold): BlockStatusSummary {
  const runId = root.own.data?.["run-id"];
  const jobs = finishJobs(root.jobs);
  const summary = {
    availability: "read" as const,
    runId: typeof runId === "string" ? runId : undefined,
    activeContexts: root.activeContexts,
    totalContexts: root.contexts,
    jobs,
    startedAt: root.firstNs === undefined ? undefined : nsToMs(root.firstNs),
  };

  // A stopped run: its render is gone and reports nothing more, so the tree is frozen where it
  // stopped. The counters stay, to say where each node was; the run itself is over.
  let cancelledNs: string | undefined;
  for (const t of root.own.reports.all)
    if (t.namespace === CreatorNamespace && t.state === blockStatusStatesRecord.Terminated)
      cancelledNs = later(cancelledNs, t.ns);
  if (cancelledNs !== undefined)
    return { ...summary, lastChangeAt: nsToMs(cancelledNs), done: true, cancelled: true };

  // A terminated render fails the run. Renders waiting on its outputs never report again, so once
  // no job is held by its command or work folder the run is over, though they still look active.
  const working = jobs.byState.some((g) => g.namespace !== RenderNamespace);
  return {
    ...summary,
    lastChangeAt: root.lastNs === undefined ? undefined : nsToMs(root.lastNs),
    // The root's outputs can be set while work it started still runs, so done needs both.
    done:
      (root.own.folded.terminal && root.activeContexts === 0) ||
      (root.failure !== undefined && !working),
    failure: root.failure === undefined ? undefined : failureHeadline(root.failure.reason),
  };
}

/** The summary of a block run, from the root action context of its render. */
export function foldBlockStatus(root: ActionContextNode): BlockStatusSummary {
  return summarize(foldSubtree(root));
}
