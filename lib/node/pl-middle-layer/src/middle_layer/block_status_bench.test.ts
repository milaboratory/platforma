/**
 * How the block status fold scales with the size of a run, through the real read path: an in-memory
 * pl-tree holding the action contexts, its accessors, and the computable over them. No backend.
 *
 * A run is a root with one branch per 1 000 jobs and the jobs under the branches. Each job carries
 * the transitions a real one writes. Three changes are timed, each followed by a read:
 *
 * - a report: one new transition on one job, as a command reports its next state;
 * - a new job: one more context under a branch, as a run fans out;
 * - an expansion: the tree opens another branch (the tree reader only).
 *
 * The "full walk" reader folds the whole tree in one computable, as the fold did before it got one
 * computable per context; it is the baseline.
 *
 * Off by default; run with
 * `BLOCK_STATUS_BENCH=1 NODE_OPTIONS=--expose-gc npx vitest run src/middle_layer/block_status_bench`.
 * With `--expose-gc` each run size starts after a collection, so the previous run's garbage does
 * not land in its first read.
 */

import { Computable, WatchableValue } from "@milaboratories/computable";
import type { SignedResourceId } from "@milaboratories/pl-client";
import {
  createSignedResourceId,
  DefaultFinalResourceDataPredicate,
  NullSignedResourceId,
} from "@milaboratories/pl-client";
import type { ExtendedResourceData, PlTreeEntry } from "@milaboratories/pl-tree";
import { PlTreeState } from "@milaboratories/pl-tree";
import { expect, test } from "vitest";
import { ActionContextType } from "../mutator/template/render_block";
import { foldSubtree, summarize } from "./block_status_fold";
import { actionContextNode, entrySummary, subtreeFold } from "./block_status_tree";
import { blockStatusTree } from "./block_status_tree_fold";

const JobsPerBranch = 1_000;
const Sizes = [1_000, 10_000, 100_000, 250_000];
/** Changes of each kind per run size; the table gives their median and slowest. */
const Changes = 20;

/** What a reader computes over the run, and how to open a context when it shows a tree. */
type Reader = { value: Computable<unknown>; expand?: (contextId: string) => void };

/** The whole tree folded in one computable: every change re-reads every context. */
function fullWalkOf(entry: PlTreeEntry): Reader {
  return {
    value: Computable.make((ctx) =>
      summarize(foldSubtree(actionContextNode(ctx.accessor(entry).node()))),
    ),
  };
}

/** The summary as `watchBlockStatus` gives it: one computable per context. */
function summaryOf(entry: PlTreeEntry): Reader {
  return { value: entrySummary(entry, true, (err) => console.error(err)) };
}

/** The tree as `watchBlockStatusTree` gives it, with the root and the expanded contexts open. */
function treeOf(entry: PlTreeEntry): Reader {
  const expanded = new WatchableValue<string[]>([]);
  return {
    value: Computable.make(
      (ctx) => ({
        expanded: expanded.getValue(ctx),
        fold: subtreeFold(entry, new Set(), (e) => console.error(e)),
      }),
      {
        postprocessValue: ({ expanded, fold }) => {
          if (fold === undefined) throw new Error("the root did not fold");
          return blockStatusTree(fold, summarize(fold), new Set(expanded));
        },
      },
    ),
    expand: (contextId) => expanded.setValue([contextId], "bench expansion"),
  };
}

const Readers = [
  { name: "full walk (before)", make: fullWalkOf },
  { name: "summary", make: summaryOf },
  { name: "tree", make: treeOf },
];

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
  const branchJobs = new Map<SignedResourceId, SignedResourceId[]>();
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
    branchJobs.set(branch, children);
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

  /** One more job under the `i`-th branch, as a run fans out. */
  const addJob = (i: number) => {
    const branch = branches[i % branches.length];
    const job = rid();
    const jobData = contextData(job, `job ${num(job)}`, [], jobKv(num(job)));
    const children = [...branchJobs.get(branch)!, job];
    branchJobs.set(branch, children);
    const grown = contextData(
      branch,
      `branch ${i % branches.length}`,
      children,
      resources.get(branch)!.kv,
    );
    resources.set(job, jobData);
    resources.set(branch, grown);
    tree.updateFromResourceData([jobData, grown]);
  };

  /** One more transition on a job, as a command reports its next state. */
  const report = (i: number) => {
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
  };

  return { tree, branches, report, addJob };
}

async function timed(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/** Times `changes` changes, each followed by a read: "median / slowest" in ms. */
async function perChange(reader: Reader, change: (i: number) => void): Promise<string> {
  const ms: number[] = [];
  for (let i = 0; i < Changes; i++) {
    change(i);
    ms.push(await timed(() => reader.value.getValue()));
  }
  ms.sort((a, b) => a - b);
  return `${fmt(ms[Math.floor(ms.length / 2)])} / ${fmt(ms[ms.length - 1])}`;
}

function fmt(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return ms < 10 ? ms.toFixed(2) : ms.toFixed(0);
}

test.skipIf(process.env.BLOCK_STATUS_BENCH === undefined)(
  "block status fold: first read and each kind of change, by run size",
  { timeout: 1_800_000 },
  async () => {
    const rows: string[] = [];
    for (const { name, make } of Readers)
      for (const size of Sizes) {
        globalThis.gc?.();
        const run = buildRun(size);
        const reader = make(run.tree.entry());

        const first = await timed(() => reader.value.getValue());
        const report = await perChange(reader, run.report);
        const newJob = await perChange(reader, run.addJob);
        const { expand } = reader;
        const expansion =
          expand === undefined
            ? "n/a"
            : await perChange(reader, (i) => expand(String(run.branches[i % run.branches.length])));
        expect(await reader.value.getValue()).toBeDefined();
        rows.push(
          `| ${name} | ${size.toLocaleString("en")} | ${fmt(first)} | ${report} | ${newJob} | ${expansion} |`,
        );
      }

    console.log(
      [
        `Times in ms, "median / slowest" of ${Changes} changes each.`,
        "",
        "| Reader | Contexts | First read | Report on a job | New job | Expand a branch |",
        "|---|---:|---:|---:|---:|---:|",
        ...rows,
      ].join("\n"),
    );
  },
);
