import { describe, expect, it } from "vitest";
import type { ActionContextNode } from "./block_status_fold";
import { failureHeadline, foldBlockStatus } from "./block_status_fold";
import type { BlockStatusJobs, BlockStatusState } from "@milaboratories/pl-model-middle-layer";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** One transition, written the way the reporters write it. */
type TransitionFixture = {
  namespace: string;
  /** The resource that reported. Defaults to the context's own render. */
  reporter?: string;
  /** Milliseconds since the epoch; the key carries nanoseconds. */
  atMs: number;
  state: BlockStatusState | string;
  detail?: string;
  reason?: string;
};

type ContextFixture = {
  id: string;
  data?: Record<string, unknown>;
  transitions?: TransitionFixture[];
  children?: ContextFixture[];
  /** Extra KV entries: readings, and malformed input. */
  kv?: Record<string, string>;
};

/** Builds an {@link ActionContextNode} over a fixture, with the backend's key layout. */
function context(fixture: ContextFixture): ActionContextNode {
  const kv = new Map<string, string>(Object.entries(fixture.kv ?? {}));
  for (const t of fixture.transitions ?? []) {
    const reporter = t.reporter ?? fixture.id;
    const ns = String(BigInt(t.atMs) * 1_000_000n);
    kv.set(
      `transition/${t.namespace}/${reporter}/${ns}`,
      JSON.stringify({ state: t.state, detail: t.detail ?? "", reason: t.reason ?? "" }),
    );
  }

  const children = (fixture.children ?? []).map(context);
  const childFields = new Map(children.map((c) => [`child/${c.id}`, c]));

  return {
    id: fixture.id,
    getData: () => fixture.data,
    listKeyValuesAsString: (prefix: string) =>
      [...kv.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value })),
    listFields: () => [...childFields.keys()],
    traverse: (field: string) => childFields.get(field),
  };
}

/** The jobs not ended, as `<namespace>/<state>: count`. */
function counts(jobs: BlockStatusJobs): Record<string, number> {
  return Object.fromEntries(jobs.byState.map((g) => [`${g.namespace}/${g.state}`, g.count]));
}

/** One group of the jobs not ended. */
function group(jobs: BlockStatusJobs, key: string) {
  return jobs.byState.find((g) => `${g.namespace}/${g.state}` === key);
}

const t0 = Date.UTC(2026, 9, 27, 12, 0, 0);
const ms = (offset: number) => t0 + offset;

/** The render's own end, as the workflow controller records it. */
const renderCompleted = (atMs: number, detail?: string): TransitionFixture => ({
  namespace: "render",
  atMs,
  state: "Completed",
  detail,
});

// ── The shape of the summary ─────────────────────────────────────────────────

describe("foldBlockStatus", () => {
  it("reports a context that has not reported as live with no state", () => {
    const summary = foldBlockStatus(context({ id: "r1" }));

    expect(summary).toMatchObject({ activeContexts: 1, totalContexts: 1, done: false });
    expect(summary.startedAt).toBeUndefined();
  });

  it("carries the run id from the root context's baggage", () => {
    const summary = foldBlockStatus(context({ id: "r1", data: { "run-id": "run-7" } }));

    expect(summary.runId).toBe("run-7");
  });
});

// ── Which state holds a node ─────────────────────────────────────────────────

describe("the state holding a node", () => {
  it("lets a wait outrank the render's Running heartbeat, however old the wait is", () => {
    // The workflow controller records Running again on every evaluation.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { namespace: "render", atMs: ms(0), state: "Running", detail: "init" },
          { namespace: "exec", reporter: "cmd1", atMs: ms(100), state: "WaitingForMachine" },
          { namespace: "render", atMs: ms(500), state: "Running", detail: "eval" },
        ],
      }),
    );

    expect(counts(summary.jobs)).toEqual({ "exec/WaitingForMachine": 1 });
    expect(group(summary.jobs, "exec/WaitingForMachine")?.since).toBe(ms(100));
  });

  it("lets a command running on a machine outrank the render's heartbeat", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { namespace: "exec", reporter: "cmd1", atMs: ms(100), state: "Running" },
          { namespace: "render", atMs: ms(500), state: "Running", detail: "eval" },
        ],
      }),
    );

    expect(counts(summary.jobs)).toEqual({ "exec/Running": 1 });
  });

  it("takes the latest transition of a reporter, not the first", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { namespace: "exec", reporter: "cmd1", atMs: ms(0), state: "WaitingForScheduler" },
          { namespace: "exec", reporter: "cmd1", atMs: ms(50), state: "Running" },
        ],
      }),
    );

    expect(counts(summary.jobs)).toEqual({ "exec/Running": 1 });
  });
});

// ── When a node has ended ────────────────────────────────────────────────────

describe("a node that has ended", () => {
  it("ends when the render reports its own completion and nothing else is running", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { namespace: "render", atMs: ms(0), state: "Running" },
          { namespace: "exec", reporter: "cmd1", atMs: ms(50), state: "Completed" },
          renderCompleted(ms(100)),
        ],
      }),
    );

    expect(summary).toMatchObject({ activeContexts: 0, totalContexts: 1, done: true });
  });

  it("stays live while a command it started is still running after its outputs are set", () => {
    // The render's Completed means its own outputs are set; a command's work stays visible.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          renderCompleted(ms(100)),
          { namespace: "exec", reporter: "cmd1", atMs: ms(50), state: "WaitingForScheduler" },
        ],
      }),
    );

    expect(summary).toMatchObject({ activeContexts: 1, done: false });
    expect(counts(summary.jobs)).toEqual({ "exec/WaitingForScheduler": 1 });
  });

  it("stays live while only its commands have finished", () => {
    // A render whose first command completed is about to create the next one.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { namespace: "render", atMs: ms(0), state: "Running" },
          { namespace: "exec", reporter: "cmd1", atMs: ms(100), state: "Completed" },
        ],
      }),
    );

    expect(summary).toMatchObject({ activeContexts: 1, done: false });
  });

  it("counts a deduplicated render as done", () => {
    // The backend ends a duplicate's context with render/Completed, detail deduplicated, and
    // names the original in a reading. The original is not followed: the reading holds a bare
    // render ID the client cannot read, and the original may live in another user's tree.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "render", atMs: ms(0), state: "Running" }],
        children: [
          {
            id: "dup",
            transitions: [renderCompleted(ms(10), "deduplicated")],
            kv: { "reading/render/dup/original": "12345" },
          },
        ],
      }),
    );

    expect(summary).toMatchObject({ totalContexts: 2, activeContexts: 1 });
  });

  it("does not count the root done while a child is still live", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [renderCompleted(ms(100))],
        children: [
          {
            id: "a",
            transitions: [{ namespace: "exec", atMs: ms(50), state: "WaitingForMachine" }],
          },
        ],
      }),
    );

    // The root's own outputs are set, but work under it still runs: not done.
    expect(summary).toMatchObject({ activeContexts: 1, done: false });
    expect(counts(summary.jobs)).toEqual({ "exec/WaitingForMachine": 1 });
  });
});

// ── Failure ──────────────────────────────────────────────────────────────────

describe("a run that ended in a failure", () => {
  it("reports the root render's termination with its reason", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { namespace: "render", atMs: ms(0), state: "Running" },
          { namespace: "render", atMs: ms(300), state: "Terminated", reason: "template error" },
        ],
      }),
    );

    expect(summary).toMatchObject({ done: true, failure: "template error" });
  });

  it("fails without a reason when the render ended without one", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "render", atMs: ms(100), state: "Terminated" }],
      }),
    );

    expect(summary).toMatchObject({ done: true, failure: "" });
  });

  it("fails on a terminated sub-render, and ends once nothing is working", () => {
    const summary = foldBlockStatus(
      context({
        id: "root",
        transitions: [renderCompleted(ms(100))],
        children: [
          {
            id: "process",
            transitions: [
              { namespace: "render", atMs: ms(200), state: "Running" },
              { namespace: "render", atMs: ms(900), state: "Terminated", reason: "late" },
            ],
          },
          {
            id: "prep",
            transitions: [
              { namespace: "render", atMs: ms(300), state: "Terminated", reason: "axesSpec" },
            ],
          },
          // Waits on the failed render's outputs and never reports again.
          {
            id: "export",
            transitions: [{ namespace: "render", atMs: ms(400), state: "WaitingForInputs" }],
          },
        ],
      }),
    );

    expect(summary).toMatchObject({ done: true, failure: "axesSpec", activeContexts: 1 });
  });

  it("counts a render that failed on its own as a failed job, not the renders passing it up", () => {
    const failedAt = (atMs: number) => ({
      namespace: "render",
      atMs,
      state: "Terminated",
      reason: "docker is not set",
    });
    const summary = foldBlockStatus(
      context({
        id: "root",
        transitions: [renderCompleted(ms(100))],
        children: [
          {
            id: "process",
            transitions: [failedAt(ms(400))],
            children: [
              { id: "save", transitions: [failedAt(ms(300))] },
              {
                id: "cmd",
                transitions: [
                  { namespace: "exec", reporter: "c", atMs: ms(200), state: "Completed" },
                  renderCompleted(ms(250)),
                ],
              },
            ],
          },
        ],
      }),
    );

    expect(summary.jobs).toMatchObject({ total: 2, done: 1, failed: 1 });
  });

  it("is not done after a failure while a job still runs", () => {
    const summary = foldBlockStatus(
      context({
        id: "root",
        transitions: [renderCompleted(ms(100))],
        children: [
          { id: "bad", transitions: [{ namespace: "render", atMs: ms(200), state: "Terminated" }] },
          {
            id: "job",
            transitions: [{ namespace: "exec", reporter: "cmd", atMs: ms(300), state: "Running" }],
          },
        ],
      }),
    );

    expect(summary).toMatchObject({ done: false, failure: "" });
    expect(counts(summary.jobs)).toEqual({ "exec/Running": 1 });
  });

  it("does not report a failure for a command the run recovered from", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "render", atMs: ms(0), state: "Running" }],
        children: [
          {
            id: "r2",
            transitions: [
              {
                namespace: "exec",
                reporter: "cmd1",
                atMs: ms(100),
                state: "Terminated",
                reason: "OOM killed",
              },
              { namespace: "exec", reporter: "cmd2", atMs: ms(200), state: "WaitingForMachine" },
            ],
          },
        ],
      }),
    );

    expect(summary).toMatchObject({ done: false, failure: undefined });
    expect(counts(summary.jobs)).toEqual({ "exec/WaitingForMachine": 1 });
  });

  it("does not report a failure when the render completed despite a terminated command", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          {
            namespace: "exec",
            reporter: "cmd1",
            atMs: ms(100),
            state: "Terminated",
            reason: "OOM killed",
          },
          renderCompleted(ms(500)),
        ],
      }),
    );

    expect(summary).toMatchObject({ done: true, activeContexts: 0, failure: undefined });
  });
});

// ── Aggregation over a tree ──────────────────────────────────────────────────

describe("aggregation over a tree", () => {
  /** `count` sibling contexts, each held by `state` from `from` on. */
  function fanOut(count: number, state: BlockStatusState, from: number): ContextFixture[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `${state}-${i}`,
      transitions: [{ namespace: "exec", reporter: `cmd-${state}-${i}`, atMs: from + i, state }],
    }));
  }

  it("counts every node and job of a fanned-out run", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "render", atMs: ms(0), state: "Running" }],
        children: [
          ...fanOut(382, "WaitingForMachine", ms(1000)),
          ...fanOut(17, "PopulatingWorkdir", ms(2000)),
        ],
      }),
    );

    expect(summary).toMatchObject({ totalContexts: 400, activeContexts: 400 });
    expect(summary.jobs.total).toBe(399);
    expect(counts(summary.jobs)).toEqual({
      "exec/WaitingForMachine": 382,
      "exec/PopulatingWorkdir": 17,
    });
  });

  it("walks nested children and spans the whole tree in its timestamps", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "render", atMs: ms(0), state: "Running" }],
        children: [
          {
            id: "r2",
            transitions: [{ namespace: "render", atMs: ms(100), state: "Running" }],
            children: [
              {
                id: "r3",
                transitions: [{ namespace: "exec", atMs: ms(900), state: "WaitingForMachine" }],
              },
            ],
          },
        ],
      }),
    );

    expect(summary).toMatchObject({ totalContexts: 3, startedAt: ms(0), lastChangeAt: ms(900) });
  });
});

// ── Input the fold must survive ──────────────────────────────────────────────

describe("malformed input", () => {
  it("skips a transition whose value is not the JSON the reporters write", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "workdir", atMs: ms(0), state: "PopulatingWorkdir" }],
        kv: { [`transition/workdir/r1/${String(BigInt(ms(100)) * 1_000_000n)}`]: "not json" },
      }),
    );

    expect(counts(summary.jobs)).toEqual({ "workdir/PopulatingWorkdir": 1 });
  });

  it("skips JSON that is not an object, in transitions and readings", () => {
    const key = (offset: number) =>
      `transition/workdir/r1/${String(BigInt(ms(offset)) * 1_000_000n)}`;
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "workdir", atMs: ms(0), state: "PopulatingWorkdir" }],
        kv: {
          [key(100)]: "null",
          [key(200)]: "42",
          [key(300)]: '["Completed"]',
          "reading/workdir/wd/progress": "null",
        },
      }),
    );

    expect(counts(summary.jobs)).toEqual({ "workdir/PopulatingWorkdir": 1 });
  });

  it("passes on a state this build does not know, as the reporter wrote it", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { namespace: "workdir", atMs: ms(0), state: "PopulatingWorkdir" },
          {
            namespace: "exec",
            reporter: "cmd1",
            atMs: ms(90_000),
            state: "WaitingForLicenceServer",
          },
        ],
      }),
    );

    expect(counts(summary.jobs)).toEqual({ "exec/WaitingForLicenceServer": 1 });
    expect(summary.lastChangeAt).toBe(ms(90_000));
  });

  it("ignores keys that are not transitions, and stamps with leading zeros", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "workdir", atMs: ms(0), state: "PopulatingWorkdir" }],
        kv: {
          "transition/render/r1": JSON.stringify({ state: "Completed" }),
          "transition/render/r1/007": JSON.stringify({ state: "Completed" }),
          "reading/exec/cmd1/progress": "40",
        },
      }),
    );

    expect(summary).toMatchObject({ done: false, activeContexts: 1 });
  });

  it("visits a context reachable twice only once", () => {
    const shared = context({
      id: "shared",
      transitions: [{ namespace: "exec", atMs: ms(100), state: "WaitingForMachine" }],
    });
    const root: ActionContextNode = {
      id: "r1",
      getData: () => undefined,
      listKeyValuesAsString: () => [],
      listFields: () => ["child/shared", "child/shared-again"],
      traverse: () => shared,
    };

    expect(foldBlockStatus(root)).toMatchObject({ totalContexts: 2, activeContexts: 2 });
  });
});

describe("a run the user stopped", () => {
  const stopped = () =>
    context({
      id: "root",
      transitions: [
        { namespace: "render", atMs: ms(0), state: "Running" },
        {
          namespace: "core",
          reporter: "root",
          atMs: ms(90_000),
          state: "Terminated",
          reason: "cancelled",
        },
      ],
      children: [
        {
          id: "c1",
          transitions: [{ namespace: "exec", reporter: "cmd", atMs: ms(10_000), state: "Running" }],
        },
      ],
    });

  it("is done and cancelled, not failed, and its time ends at the stop", () => {
    const summary = foldBlockStatus(stopped());

    expect(summary).toMatchObject({ done: true, cancelled: true, lastChangeAt: ms(90_000) });
    expect(summary.failure).toBeUndefined();
  });

  it("keeps the counters, to say where each node was when it stopped", () => {
    expect(counts(foldBlockStatus(stopped()).jobs)).toEqual({ "exec/Running": 1 });
  });

  it("is not cancelled while only the backend has reported", () => {
    const running = context({
      id: "root",
      transitions: [{ namespace: "render", atMs: ms(0), state: "Running" }],
    });
    expect(foldBlockStatus(running).cancelled).toBeUndefined();
  });
});

describe("the run's jobs", () => {
  const job = (id: string, ...transitions: TransitionFixture[]): ContextFixture => ({
    id,
    transitions: [{ namespace: "render", atMs: ms(0), state: "Running" }, ...transitions],
  });
  const exec = (atMs: number, state: string): TransitionFixture => ({
    namespace: "exec",
    reporter: "cmd",
    atMs,
    state,
  });
  const workdir = (atMs: number, state: string): TransitionFixture => ({
    namespace: "workdir",
    reporter: "wd",
    atMs,
    state,
  });

  const summary = foldBlockStatus(
    context({
      id: "root",
      transitions: [{ namespace: "render", atMs: ms(0), state: "Running" }],
      children: [
        // A template render that only prepares jobs is not one.
        { id: "prepare", transitions: [{ namespace: "render", atMs: ms(1), state: "Running" }] },
        {
          ...job("copy-1", workdir(ms(5), "PopulatingWorkdir")),
          kv: { "reading/workdir/wd/progress": '{"done":3,"total":4}' },
        },
        {
          ...job("copy-2", workdir(ms(6), "PopulatingWorkdir")),
          kv: { "reading/workdir/wd/progress": '{"done":1,"total":2}' },
        },
        job("queued-late", exec(ms(30), "WaitingSubmissionGate")),
        job("queued-early", exec(ms(20), "WaitingSubmissionGate")),
        job("pending", exec(ms(40), "WaitingForScheduler")),
        job("running", exec(ms(50), "Running")),
        job("saving", workdir(ms(60), "CollectingOutputs")),
        job("done", exec(ms(70), "Completed"), renderCompleted(ms(71))),
        job("failed", exec(ms(80), "Terminated"), {
          namespace: "render",
          atMs: ms(81),
          state: "Terminated",
          reason: "exit 137",
        }),
      ],
    }),
  );

  it("counts each job once, by where it is now", () => {
    expect(summary.jobs).toMatchObject({ total: 9, done: 1, failed: 1 });
    expect(counts(summary.jobs)).toEqual({
      "workdir/PopulatingWorkdir": 2,
      "exec/WaitingSubmissionGate": 2,
      "exec/WaitingForScheduler": 1,
      "exec/Running": 1,
      "workdir/CollectingOutputs": 1,
    });
  });

  it("sums the files copied by the jobs in each state", () => {
    expect(group(summary.jobs, "workdir/PopulatingWorkdir")?.files).toEqual({ done: 4, total: 6 });
  });

  it("dates each state from the earliest job still in it", () => {
    expect(group(summary.jobs, "exec/WaitingSubmissionGate")?.since).toBe(ms(20));
    expect(group(summary.jobs, "exec/WaitingForScheduler")?.since).toBe(ms(40));
  });

  it("lists the largest group first", () => {
    expect(summary.jobs.byState.map((g) => g.count)).toEqual([2, 2, 1, 1, 1]);
  });

  it("has no jobs before any command or work folder reports", () => {
    const empty = foldBlockStatus(
      context({
        id: "root",
        transitions: [{ namespace: "render", atMs: ms(0), state: "Running" }],
      }),
    );
    expect(empty.jobs).toEqual({ total: 0, done: 0, failed: 0, byState: [] });
  });
});

describe("failureHeadline", () => {
  it("keeps the innermost error of a nested chain, without stack frames", () => {
    const reason = [
      'cannot eval code: cannot eval template: tengo template error: input resource has errors: "[I] "NG:0x1/data": has input errors: [O] "NG:0x2/outputs/binPath": has input errors: Command ID: "NG:0x3"',
      'Working directory: "workdirs/0x4"',
      'Command name: "python"',
      "Failed to start.",
      'Command: "python" "-c" "import platform"',
      "Error: docker is not set",
      "@platforma-sdk/workflow-tengo:exec.exec-impl:97:1",
    ].join("\n");

    expect(failureHeadline(reason)).toBe("python failed: docker is not set");
  });

  it("reads a command failure written on one line", () => {
    const reason =
      'cannot eval code: input resource has errors: "[O] "NG:0x1/outputs/binDir": has input errors: Command ID: "NG:0x2" Working directory: "workdirs/0x3" Command name: "python" Failed to start. Command: "python" "-c" "x" Error: docker is not set\n@platforma-sdk/workflow-tengo:ll:24:2';

    expect(failureHeadline(reason)).toBe("python failed: docker is not set");
  });

  it("drops the template wrappers of a template's own error", () => {
    const reason =
      'cannot eval code: cannot eval template: cannot get element from strictMap: key "axesSpec" not found\n@platforma-open/milaboratories.mixcr-clonotyping-2.workflow:process:80:32';

    expect(failureHeadline(reason)).toBe(
      'cannot get element from strictMap: key "axesSpec" not found',
    );
  });

  it("caps a long message", () => {
    expect(failureHeadline("x".repeat(500))).toHaveLength(200);
  });
});
