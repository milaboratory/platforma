import { describe, expect, it } from "vitest";
import type { BlockStatusState } from "@milaboratories/pl-model-middle-layer";
import type { ActionContextNode } from "./block_status_fold";
import { foldBlockStatus } from "./block_status_fold";
import type { ContextFixture } from "./block_status_test_utils";
import { context, ms, renderCompleted } from "./block_status_test_utils";

// ── The shape of the summary ─────────────────────────────────────────────────

describe("foldBlockStatus", () => {
  it("reports a context that has not reported as live with no state", () => {
    const summary = foldBlockStatus(context({ id: "r1" }));

    expect(summary).toMatchObject({ liveNodes: 1, totalNodes: 1, byState: [], done: false });
    expect(summary.line).toBeUndefined();
    expect(summary.startedAt).toBeUndefined();
  });

  it("carries the run id from the root context's baggage", () => {
    const summary = foldBlockStatus(context({ id: "r1", data: { "run-id": "run-7" } }));

    expect(summary.runId).toBe("run-7");
  });

  it("names the state holding a single render", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "workdir", atMs: ms(0), state: "PopulatingWorkdir" }],
      }),
    );

    expect(summary.byState).toEqual([
      {
        state: "PopulatingWorkdir",
        onMachine: false,
        phrase: "staging input files",
        nodes: 1,
        since: ms(0),
        detail: undefined,
      },
    ]);
    expect(summary.line).toMatchObject({ state: "PopulatingWorkdir", nodes: 1, ofNodes: 1 });
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

    expect(summary.line).toMatchObject({ state: "WaitingForMachine", heldSince: ms(100) });
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

    expect(summary.line).toMatchObject({
      state: "Running",
      onMachine: true,
      phrase: "running on a machine",
    });
  });

  it("keeps a command's Running apart from the render's Running", () => {
    // Two nodes evaluating template code, one with a job on a machine: two groups, two phrases.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "render", atMs: ms(0), state: "Running" }],
        children: [
          { id: "a", transitions: [{ namespace: "render", atMs: ms(10), state: "Running" }] },
          {
            id: "b",
            transitions: [{ namespace: "exec", reporter: "cmd", atMs: ms(20), state: "Running" }],
          },
        ],
      }),
    );

    expect(summary.byState.map((g) => [g.phrase, g.nodes])).toEqual([
      ["evaluating the workflow", 2],
      ["running on a machine", 1],
    ]);
  });

  it("takes the latest transition of a reporter, not the first", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { namespace: "workdir", atMs: ms(0), state: "WaitingWorkdirGate" },
          { namespace: "workdir", atMs: ms(50), state: "PopulatingWorkdir", detail: "12 files" },
        ],
      }),
    );

    expect(summary.byState).toHaveLength(1);
    expect(summary.line).toMatchObject({ state: "PopulatingWorkdir", detail: "12 files" });
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

    expect(summary).toMatchObject({ liveNodes: 0, totalNodes: 1, done: true });
    expect(summary.line).toBeUndefined();
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

    expect(summary).toMatchObject({ liveNodes: 1, done: false });
    expect(summary.line).toMatchObject({ state: "WaitingForScheduler" });
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

    expect(summary).toMatchObject({ liveNodes: 1, done: false });
    expect(summary.line).toMatchObject({ state: "Running", onMachine: false });
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

    expect(summary).toMatchObject({ totalNodes: 2, liveNodes: 1 });
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
    expect(summary).toMatchObject({ liveNodes: 1, done: false });
    expect(summary.line).toMatchObject({ state: "WaitingForMachine" });
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
    expect(summary.line).toMatchObject({
      state: "Terminated",
      phrase: "failed",
      reason: "template error",
    });
  });

  it("leaves the reason out when the render ended without one", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "render", atMs: ms(100), state: "Terminated" }],
      }),
    );

    expect(summary.line).toMatchObject({ state: "Terminated" });
    expect(summary.line?.reason).toBeUndefined();
    expect(summary.failure).toBeUndefined();
  });

  it("does not take the line for a command the run recovered from", () => {
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
    expect(summary.line).toMatchObject({ state: "WaitingForMachine" });
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

    expect(summary).toMatchObject({ done: true, liveNodes: 0, failure: undefined });
    expect(summary.line).toBeUndefined();
  });

  it("keeps the line consistent with the counters it ships with", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ namespace: "render", atMs: ms(0), state: "Running" }],
        children: [
          {
            id: "a",
            transitions: [{ namespace: "exec", atMs: ms(100), state: "WaitingForMachine" }],
          },
          {
            id: "b",
            transitions: [{ namespace: "exec", atMs: ms(150), state: "WaitingForMachine" }],
          },
        ],
      }),
    );

    const named = summary.byState.find(
      (g) => g.state === summary.line?.state && g.onMachine === summary.line?.onMachine,
    );
    expect(summary.line?.nodes).toBe(named?.nodes);
    expect(summary.line?.ofNodes).toBe(summary.liveNodes);
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

  it("leads with the state holding the most nodes", () => {
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

    expect(summary).toMatchObject({ totalNodes: 400, liveNodes: 400 });
    expect(summary.line).toMatchObject({ state: "WaitingForMachine", nodes: 382, ofNodes: 400 });
  });

  it("breaks a tie in favour of the group held longest, then by name", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        children: [
          ...fanOut(2, "WaitingForMachine", ms(2000)),
          ...fanOut(2, "WaitingForScheduler", ms(1000)),
        ],
      }),
    );

    expect(summary.byState.map((g) => g.state)).toEqual([
      "WaitingForScheduler",
      "WaitingForMachine",
    ]);
  });

  it("orders groups less than a millisecond apart by their nanosecond stamps", () => {
    const a = context({
      id: "a",
      kv: {
        "transition/exec/1/1000000000000000100": JSON.stringify({ state: "WaitingForMachine" }),
      },
    });
    const b = context({
      id: "b",
      kv: {
        "transition/exec/2/1000000000000000050": JSON.stringify({ state: "WaitingForScheduler" }),
      },
    });
    const root: ActionContextNode = {
      id: "r1",
      getData: () => undefined,
      listKeyValuesAsString: () => [],
      listFields: () => ["child/a", "child/b"],
      traverse: (f) => (f === "child/a" ? a : b),
    };

    expect(foldBlockStatus(root).byState.map((g) => g.state)).toEqual([
      "WaitingForScheduler",
      "WaitingForMachine",
    ]);
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

    expect(summary).toMatchObject({ totalNodes: 3, startedAt: ms(0), lastChangeAt: ms(900) });
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

    expect(summary.line).toMatchObject({ state: "PopulatingWorkdir" });
  });

  it("skips a state this build does not know, but still advances the clock", () => {
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

    expect(summary.line).toMatchObject({ state: "PopulatingWorkdir" });
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

    expect(summary).toMatchObject({ done: false, liveNodes: 1 });
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

    expect(foldBlockStatus(root)).toMatchObject({ totalNodes: 2, liveNodes: 2 });
  });
});
