import type { TxOutcomeCounts } from "@milaboratories/pl-client";

/** Work a middle layer has done since it started, by name. */
export type ExecCountersSnapshot = {
  /** Model bundle evaluations by the lambda they were made for. Every evaluation is a fresh VM. */
  bundleEvaluations: Record<string, number>;
  /**
   * Model callbacks run, by the lambda they were run for. A deferred value handed back into a
   * VM that waits for it is one more callback of the lambda that asked for it.
   */
  callbacks: Record<string, number>;
  /** Transaction attempts made through the middle layer's client, by transaction name and outcome. */
  transactions: Record<string, TxOutcomeCounts>;
  /**
   * Backend polls of the synchronized trees the middle layer opened, by tree: `project:<id>` for
   * a project, `status:<project id>/<block id>/<mode>` for the status of a block render, and the role of
   * every other tree.
   */
  treePolls: Record<string, number>;
};

/** Counts model code executions by lambda handle. */
export class JsExecCounters {
  private readonly bundleEvaluations = new Map<string, number>();
  private readonly callbacks = new Map<string, number>();

  public countBundleEvaluation(lambda: string): void {
    increment(this.bundleEvaluations, lambda);
  }

  public countCallback(lambda: string): void {
    increment(this.callbacks, lambda);
  }

  /** Counts so far; later executions do not change the returned object. */
  public snapshot(): Pick<ExecCountersSnapshot, "bundleEvaluations" | "callbacks"> {
    return {
      bundleEvaluations: Object.fromEntries(this.bundleEvaluations),
      callbacks: Object.fromEntries(this.callbacks),
    };
  }
}

/** Counts backend polls of synchronized trees by tree. */
export class TreePollCounters {
  private readonly polls = new Map<string, number>();

  public countPoll(tree: string): void {
    increment(this.polls, tree);
  }

  /** Counts so far; later polls do not change the returned object. */
  public snapshot(): Record<string, number> {
    return Object.fromEntries(this.polls);
  }
}

/** Model bundle evaluations by lambda between two readings of the same counters. */
export function bundleEvaluationsDelta(
  before: Pick<ExecCountersSnapshot, "bundleEvaluations">,
  after: Pick<ExecCountersSnapshot, "bundleEvaluations">,
): Record<string, number> {
  return countsDelta(before.bundleEvaluations, after.bundleEvaluations);
}

/** Work done between two snapshots of the same middle layer. Names with no work in between are left out. */
export function execCountersDelta(
  before: ExecCountersSnapshot,
  after: ExecCountersSnapshot,
): ExecCountersSnapshot {
  const transactions: Record<string, TxOutcomeCounts> = {};
  for (const [name, counts] of Object.entries(after.transactions)) {
    const delta = txCountsDelta(before.transactions[name], counts);
    if (delta !== undefined) transactions[name] = delta;
  }
  return {
    bundleEvaluations: countsDelta(before.bundleEvaluations, after.bundleEvaluations),
    callbacks: countsDelta(before.callbacks, after.callbacks),
    transactions,
    treePolls: countsDelta(before.treePolls, after.treePolls),
  };
}

/**
 * One log line for the work in `delta`, done over `periodMs`: each transaction name with its
 * attempts by outcome, then each lambda with the number of VMs started for it, then each tree
 * with the number of times it polled the backend. Undefined when the delta holds no work, so an
 * idle period writes nothing.
 */
export function formatExecCountersDelta(
  delta: ExecCountersSnapshot,
  periodMs: number,
): string | undefined {
  const parts = Object.entries(delta.transactions).map(
    ([name, counts]) =>
      `tx ${JSON.stringify(name)} committed=${counts.committed} closed=${counts.closed} ` +
      `conflict=${counts.conflict} error=${counts.error}`,
  );
  const vms = Object.entries(delta.bundleEvaluations).map(([lambda, n]) => `${lambda}=${n}`);
  if (vms.length > 0) parts.push(`vm ${vms.join(" ")}`);
  const polls = Object.entries(delta.treePolls).map(([tree, n]) => `${tree}=${n}`);
  if (polls.length > 0) parts.push(`polls ${polls.join(" ")}`);
  if (parts.length === 0) return undefined;
  return `[exec-counters] ${Math.round(periodMs / 1000)}s: ${parts.join("; ")}`;
}

// Internals

function increment(counts: Map<string, number>, name: string): void {
  counts.set(name, (counts.get(name) ?? 0) + 1);
}

function countsDelta(
  before: Record<string, number>,
  after: Record<string, number>,
): Record<string, number> {
  const delta: Record<string, number> = {};
  for (const [name, count] of Object.entries(after)) {
    const added = count - (before[name] ?? 0);
    if (added !== 0) delta[name] = added;
  }
  return delta;
}

function txCountsDelta(
  before: TxOutcomeCounts | undefined,
  after: TxOutcomeCounts,
): TxOutcomeCounts | undefined {
  const delta: TxOutcomeCounts = {
    committed: after.committed - (before?.committed ?? 0),
    closed: after.closed - (before?.closed ?? 0),
    conflict: after.conflict - (before?.conflict ?? 0),
    error: after.error - (before?.error ?? 0),
  };
  return Object.values(delta).every((count) => count === 0) ? undefined : delta;
}
