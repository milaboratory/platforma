/**
 * How the block status fold scales with the size of a run, through the real read path: an in-memory
 * pl-tree holding the action contexts, its accessors, and the computable over them. No backend.
 *
 * A run is a root with one branch per 1 000 jobs and the jobs under the branches. Each job carries
 * the transitions a real one writes. A report is one new transition on one job, as a command
 * reports its next state.
 *
 * Off by default; run with `BLOCK_STATUS_BENCH=1 npx vitest run src/middle_layer/block_status_bench`.
 */

import { Computable } from "@milaboratories/computable";
import type { SignedResourceId } from "@milaboratories/pl-client";
import {
  createSignedResourceId,
  DefaultFinalResourceDataPredicate,
  NullSignedResourceId,
} from "@milaboratories/pl-client";
import type { ExtendedResourceData, PlTreeEntry } from "@milaboratories/pl-tree";
import { PlTreeState } from "@milaboratories/pl-tree";
import type { BlockStatusSummary } from "@milaboratories/pl-model-middle-layer";
import { expect, test } from "vitest";
import { ActionContextType } from "../mutator/template/render_block";
import { entrySummary } from "./block_status_tree";

const JobsPerBranch = 1_000;
const Sizes = [1_000, 10_000, 100_000];
const Reports = 20;

/** The computable under test: the summary of the run rooted at `entry`. */
function summaryOf(entry: PlTreeEntry): Computable<BlockStatusSummary> {
  return entrySummary(entry, true, (err) => console.error(err));
}

const t0 = 1_800_000_000_000_000_000n;

function transition(namespace: string, reporter: number, atNs: bigint, state: string) {
  return {
    key: `transition/${namespace}/${reporter}/${atNs}`,
    value: Buffer.from(JSON.stringify({ state, detail: "", reason: "" })),
  };
}

/** A job somewhere in its life: done, running, queued or copying its input. */
function jobKv(id: number): ExtendedResourceData["kv"] {
  const at = t0 + BigInt(id) * 1_000_000n;
  const kv = [transition("render", id, at, "Running")];
  switch (id % 10) {
    case 0:
      kv.push(transition("workdir", id + 1, at + 1n, "PopulatingWorkdir"));
      kv.push({
        key: `reading/workdir/${id + 1}/progress`,
        value: Buffer.from('{"done":3,"total":8}'),
      });
      return kv;
    case 1:
      kv.push(transition("exec", id + 2, at + 2n, "WaitingSubmissionGate"));
      return kv;
    case 2:
    case 3:
      kv.push(transition("exec", id + 2, at + 2n, "Running"));
      return kv;
    default:
      kv.push(transition("exec", id + 2, at + 2n, "Running"));
      kv.push(transition("exec", id + 2, at + 3n, "Completed"));
      kv.push(transition("render", id, at + 4n, "Completed"));
      return kv;
  }
}

function contextData(
  rid: SignedResourceId,
  name: string,
  children: SignedResourceId[],
  kv: ExtendedResourceData["kv"],
): ExtendedResourceData {
  return {
    id: rid,
    originalResourceId: NullSignedResourceId,
    canonicalId: new Uint8Array(0),
    kind: "Structural",
    type: ActionContextType,
    data: Buffer.from(JSON.stringify({ name })),
    error: NullSignedResourceId,
    inputsLocked: false,
    outputsLocked: false,
    resourceReady: false,
    final: false,
    fields: children.map((child) => ({
      name: `child/${String(child)}`,
      type: "Dynamic",
      value: child,
      error: NullSignedResourceId,
      status: "Resolved",
      valueIsFinal: false,
    })),
    kv,
  };
}

/** A run of `size` contexts, and the jobs a report can land on. */
function buildRun(size: number) {
  let next = 1;
  /** The number behind each id, which the reporters' keys use. */
  const numbers = new Map<SignedResourceId, number>();
  const rid = () => {
    const n = next++;
    const id = createSignedResourceId(BigInt(n));
    numbers.set(id, n);
    return id;
  };
  const num = (id: SignedResourceId) => numbers.get(id)!;
  const root = rid();
  const resources = new Map<SignedResourceId, ExtendedResourceData>();
  const jobs: SignedResourceId[] = [];

  const branches: SignedResourceId[] = [];
  for (let made = 1; made < size;) {
    const branch = rid();
    branches.push(branch);
    made++;
    const children: SignedResourceId[] = [];
    for (let j = 0; j < JobsPerBranch && made < size; j++, made++) {
      const job = rid();
      children.push(job);
      jobs.push(job);
      resources.set(job, contextData(job, `job ${j}`, [], jobKv(num(job))));
    }
    resources.set(
      branch,
      contextData(branch, `branch ${branches.length}`, children, [
        transition("render", num(branch), t0, "Running"),
      ]),
    );
  }
  resources.set(
    root,
    contextData(root, "root", branches, [transition("render", num(root), t0, "Running")]),
  );

  const tree = new PlTreeState(root, DefaultFinalResourceDataPredicate);
  tree.updateFromResourceData([...resources.values()]);
  return { tree, resources, jobs, num };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  return { ms: performance.now() - start, value };
}

const fmt = (ms: number) => (ms < 10 ? ms.toFixed(2) : ms.toFixed(0));

test.skipIf(process.env.BLOCK_STATUS_BENCH === undefined)(
  "block status fold: first read and one report, by run size",
  { timeout: 600_000 },
  async () => {
    const rows: string[] = [];
    for (const size of Sizes) {
      const { tree, resources, jobs, num } = buildRun(size);
      const summary = summaryOf(tree.entry());

      const first = await timed(() => summary.getValue());
      expect(first.value.totalContexts).toBe(size);

      const perReport: number[] = [];
      for (let i = 0; i < Reports; i++) {
        const job = jobs[(i * 7919) % jobs.length];
        const data = resources.get(job)!;
        const updated = {
          ...data,
          kv: [
            ...data.kv,
            transition("exec", num(job) + 2, t0 + 10_000_000_000n + BigInt(i), "Completed"),
          ],
        };
        resources.set(job, updated);
        tree.updateFromResourceData([updated]);
        perReport.push((await timed(() => summary.getValue())).ms);
      }
      perReport.sort((a, b) => a - b);
      const median = perReport[Math.floor(perReport.length / 2)];
      const worst = perReport[perReport.length - 1];
      rows.push(
        `| ${size.toLocaleString("en")} | ${fmt(first.ms)} | ${fmt(median)} | ${fmt(worst)} |`,
      );
    }

    console.log(
      [
        "| Contexts | First read, ms | One report, median ms | One report, worst ms |",
        "|---:|---:|---:|---:|",
        ...rows,
      ].join("\n"),
    );
  },
);
