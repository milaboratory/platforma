import { describe, expect, it } from "vitest";
import type { StatusContextNode } from "./block_status_fold";
import { foldBlockStatus } from "./block_status_fold";
import type { BlockStatusState } from "@milaboratories/pl-model-middle-layer";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** One transition, written the way the backend writes it. */
type TransitionFixture = {
  topic: string;
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
  /** Extra KV entries, for the `done` marker and for malformed input. */
  kv?: Record<string, string>;
};

/** Builds a {@link StatusContextNode} over a fixture, with the backend's key layout. */
function context(fixture: ContextFixture): StatusContextNode {
  const kv = new Map<string, string>(Object.entries(fixture.kv ?? {}));
  for (const t of fixture.transitions ?? []) {
    const reporter = t.reporter ?? fixture.id;
    const ns = String(BigInt(t.atMs) * 1_000_000n);
    kv.set(
      `transition/${t.topic}/${reporter}/${ns}`,
      JSON.stringify({ state: t.state, detail: t.detail ?? "", reason: t.reason ?? "" }),
    );
  }

  const children = (fixture.children ?? []).map(context);
  const childFields = new Map(children.map((c) => [`child/${c.id}`, c]));

  return {
    id: fixture.id,
    getData: () => fixture.data,
    getValue: (key: string) => kv.get(key),
    listKeyValuesAsString: (prefix = "") =>
      [...kv.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value })),
    listFields: () => [...childFields.keys()],
    traverse: (field) => childFields.get(field),
  };
}

const t0 = Date.UTC(2026, 9, 16, 12, 0, 0);
const ms = (offset: number) => t0 + offset;

// ── The shape of the summary ─────────────────────────────────────────────────

describe("foldBlockStatus", () => {
  it("reports an empty summary for a context that has not reported", () => {
    const summary = foldBlockStatus(context({ id: "r1" }));

    expect(summary).toMatchObject({
      liveNodes: 1,
      totalNodes: 1,
      byState: [],
      line: undefined,
      done: false,
      failure: undefined,
    });
    expect(summary.startedAt).toBeUndefined();
  });

  it("carries the run id from the root context's data", () => {
    const summary = foldBlockStatus(
      context({ id: "r1", data: { "run-id": "run-7", name: "Clonotyping" } }),
    );

    expect(summary.runId).toBe("run-7");
  });

  it("counts a single waiting render", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "core", atMs: ms(0), state: "WaitingForInputs" }],
      }),
    );

    expect(summary.liveNodes).toBe(1);
    expect(summary.byState).toEqual([
      {
        state: "WaitingForInputs",
        phrase: "waiting for inputs",
        nodes: 1,
        since: ms(0),
        detail: undefined,
      },
    ]);
    expect(summary.line).toMatchObject({
      state: "WaitingForInputs",
      nodes: 1,
      ofNodes: 1,
      heldSince: ms(0),
    });
    expect(summary.startedAt).toBe(ms(0));
    expect(summary.lastChangeAt).toBe(ms(0));
  });
});

// ── Which state holds a node ─────────────────────────────────────────────────

describe("the state holding a node", () => {
  it("lets a wait outrank the render's Running heartbeat, however old the wait is", () => {
    // The workflow controller records Running again on every re-evaluation, so it routinely
    // carries a newer timestamp than the wait that actually holds the node.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { topic: "render", atMs: ms(0), state: "Running" },
          { topic: "exec", reporter: "cmd1", atMs: ms(100), state: "WaitingForMachine" },
          { topic: "render", atMs: ms(500), state: "Running" },
        ],
      }),
    );

    expect(summary.line).toMatchObject({
      state: "WaitingForMachine",
      phrase: "waiting for a machine",
      heldSince: ms(100),
    });
  });

  it("is the most recent state a reporter has not left", () => {
    // The render is evaluating template code, and a command it created is waiting for quota.
    // The wait is what holds the node, and it is also the more recent report.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { topic: "render", atMs: ms(0), state: "Running" },
          {
            topic: "exec",
            reporter: "cmd1",
            atMs: ms(100),
            state: "WaitingSubmissionGate",
            detail: "queue heavy",
          },
        ],
      }),
    );

    expect(summary.line).toMatchObject({
      state: "WaitingSubmissionGate",
      phrase: "held against a compute quota",
      detail: "queue heavy",
      heldSince: ms(100),
    });
  });

  it("falls back to an earlier reporter once the later one is finished", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { topic: "render", atMs: ms(0), state: "Running" },
          { topic: "exec", reporter: "cmd1", atMs: ms(100), state: "WaitingSubmissionGate" },
          { topic: "exec", reporter: "cmd1", atMs: ms(200), state: "Completed" },
        ],
      }),
    );

    expect(summary.line).toMatchObject({ state: "Running", heldSince: ms(0) });
    expect(summary.done).toBe(false);
  });

  it("takes the latest transition of a reporter, not the first", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { topic: "workdir", atMs: ms(0), state: "WaitingWorkdirGate" },
          {
            topic: "workdir",
            atMs: ms(50),
            state: "PopulatingWorkdir",
            detail: "staging 12 files",
          },
        ],
      }),
    );

    expect(summary.byState).toHaveLength(1);
    expect(summary.line).toMatchObject({
      state: "PopulatingWorkdir",
      phrase: "staging input files",
      detail: "staging 12 files",
    });
  });
});

// ── When a node has ended ────────────────────────────────────────────────────

describe("a node that has ended", () => {
  it("ends on a terminal transition under topic core", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { topic: "render", atMs: ms(0), state: "Running" },
          { topic: "core", atMs: ms(100), state: "Completed" },
        ],
      }),
    );

    expect(summary).toMatchObject({ liveNodes: 0, totalNodes: 1, done: true, line: undefined });
  });

  it("ends on the done marker even without a terminal transition", () => {
    // The backend's completion write does not exist yet; the marker is the other half of the
    // contract, and either one alone ends the node.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "render", atMs: ms(0), state: "Running" }],
        kv: { done: "1" },
      }),
    );

    expect(summary).toMatchObject({ liveNodes: 0, done: true });
  });

  it("stays live while only its reporters have finished", () => {
    // A render whose first command completed is not finished: it is about to create the next one.
    // Only the backend's own write (core, or the done key) ends a node.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { topic: "render", atMs: ms(0), state: "Running" },
          { topic: "exec", reporter: "cmd1", atMs: ms(100), state: "Completed" },
        ],
      }),
    );

    expect(summary).toMatchObject({ liveNodes: 1, done: false });
    expect(summary.line).toMatchObject({ state: "Running" });
  });

  it("does not mistake a key merely starting with done for the marker", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "render", atMs: ms(0), state: "Running" }],
        kv: { doneish: "1" },
      }),
    );

    expect(summary.done).toBe(false);
  });
});

// ── Failure ──────────────────────────────────────────────────────────────────

describe("a run that ended in a failure", () => {
  it("reports the failure as the line once the root render has ended", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { topic: "render", atMs: ms(0), state: "Running" },
          { topic: "core", atMs: ms(300), state: "Terminated", reason: "OOM killed" },
        ],
      }),
    );

    expect(summary.failure).toBe("OOM killed");
    expect(summary.done).toBe(true);
    expect(summary.line).toMatchObject({
      state: "Terminated",
      phrase: "failed",
      reason: "OOM killed",
    });
  });

  it("takes the reason from a child when the root's own ending carries none", () => {
    // The backend marks the render done without a reason of its own; the reason the user needs
    // is the one the engine gave the command that died.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        kv: { done: "1" },
        transitions: [
          {
            topic: "exec",
            reporter: "cmd1",
            atMs: ms(100),
            state: "Terminated",
            reason: "OOM killed",
          },
        ],
      }),
    );

    expect(summary).toMatchObject({ done: true, failure: "OOM killed" });
    expect(summary.line).toMatchObject({ state: "Terminated", reason: "OOM killed" });
  });

  it("leaves the reason out when the engine reported none", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "core", atMs: ms(100), state: "Terminated" }],
      }),
    );

    expect(summary.line).toMatchObject({ state: "Terminated" });
    expect(summary.line?.reason).toBeUndefined();
    expect(summary.failure).toBeUndefined();
  });

  it("does NOT take the line for a termination the run recovered from", () => {
    // A command is OOM-killed and retried. While the root render is live, what holds the block is
    // what its live nodes are doing, not the failure it already recovered from.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "render", atMs: ms(0), state: "Running" }],
        children: [
          {
            id: "r2",
            transitions: [
              {
                topic: "exec",
                reporter: "cmd1",
                atMs: ms(100),
                state: "Terminated",
                reason: "OOM killed",
              },
              { topic: "exec", reporter: "cmd2", atMs: ms(200), state: "WaitingForMachine" },
            ],
          },
        ],
      }),
    );

    expect(summary.done).toBe(false);
    expect(summary.failure).toBeUndefined();
    expect(summary.line).toMatchObject({ state: "WaitingForMachine" });
  });

  it("does NOT report a failure on a run that completed after an earlier termination", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "core", atMs: ms(500), state: "Completed" }],
        children: [
          {
            id: "r2",
            kv: { done: "1" },
            transitions: [
              {
                topic: "exec",
                reporter: "cmd1",
                atMs: ms(100),
                state: "Terminated",
                reason: "OOM killed",
              },
              { topic: "exec", reporter: "cmd1", atMs: ms(200), state: "Completed" },
            ],
          },
        ],
      }),
    );

    expect(summary).toMatchObject({ done: true, liveNodes: 0 });
    expect(summary.failure).toBeUndefined();
    expect(summary.line).toBeUndefined();
  });

  it("keeps the line consistent with the counters it ships with", () => {
    // The line and byState must never contradict each other: whatever the line names is a group
    // in byState, with the same count.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "render", atMs: ms(0), state: "Running" }],
        children: [
          {
            id: "a",
            transitions: [{ topic: "exec", atMs: ms(100), state: "WaitingForMachine" }],
          },
          {
            id: "b",
            transitions: [{ topic: "exec", atMs: ms(150), state: "WaitingForMachine" }],
          },
        ],
      }),
    );

    const named = summary.byState.find((g) => g.state === summary.line?.state);
    expect(named).toBeDefined();
    expect(summary.line?.nodes).toBe(named?.nodes);
    expect(summary.line?.ofNodes).toBe(summary.liveNodes);
  });
});

describe("aggregation over a tree", () => {
  /** `count` sibling contexts, each held by `state` from `from` on. Ids carry the state, since a
   * context is counted once however many times the walk reaches it. */
  function fanOut(count: number, state: BlockStatusState, from: number): ContextFixture[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `${state}-${i}`,
      transitions: [{ topic: "exec", reporter: `cmd-${state}-${i}`, atMs: from + i, state }],
    }));
  }

  it("leads with the state holding the most nodes", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "render", atMs: ms(0), state: "Running" }],
        children: [
          ...fanOut(382, "WaitingForMachine", ms(1000)),
          ...fanOut(17, "PopulatingWorkdir", ms(2000)),
        ],
      }),
    );

    expect(summary.totalNodes).toBe(400);
    expect(summary.liveNodes).toBe(400);
    expect(summary.line).toMatchObject({
      state: "WaitingForMachine",
      phrase: "waiting for a machine",
      nodes: 382,
      ofNodes: 400,
      heldSince: ms(1000),
    });
    expect(summary.byState.map((g) => g.state)).toEqual([
      "WaitingForMachine",
      "PopulatingWorkdir",
      "Running",
    ]);
  });

  it("breaks a tie on which group has been held longest", () => {
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

  it("takes the group's detail from its most recent member", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        children: [
          {
            id: "a",
            transitions: [
              { topic: "workdir", atMs: ms(100), state: "PopulatingWorkdir", detail: "staging 2" },
            ],
          },
          {
            id: "b",
            transitions: [
              { topic: "workdir", atMs: ms(300), state: "PopulatingWorkdir", detail: "staging 12" },
            ],
          },
        ],
      }),
    );

    expect(summary.byState[0]).toMatchObject({
      nodes: 2,
      since: ms(100),
      detail: "staging 12",
    });
  });

  it("counts a finished child but does not count it as live", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "render", atMs: ms(0), state: "Running" }],
        children: [
          { id: "a", transitions: [{ topic: "core", atMs: ms(100), state: "Completed" }] },
          {
            id: "b",
            transitions: [{ topic: "exec", atMs: ms(200), state: "WaitingForScheduler" }],
          },
        ],
      }),
    );

    expect(summary).toMatchObject({ totalNodes: 3, liveNodes: 2 });
    expect(summary.lastChangeAt).toBe(ms(200));
  });

  it("walks nested children and spans the whole tree in its timestamps", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "render", atMs: ms(0), state: "Running" }],
        children: [
          {
            id: "r2",
            transitions: [{ topic: "render", atMs: ms(100), state: "Running" }],
            children: [
              {
                id: "r3",
                transitions: [{ topic: "exec", atMs: ms(900), state: "WaitingForMachine" }],
              },
            ],
          },
        ],
      }),
    );

    expect(summary.totalNodes).toBe(3);
    expect(summary.startedAt).toBe(ms(0));
    expect(summary.lastChangeAt).toBe(ms(900));
  });
});

// ── Input the fold must survive ──────────────────────────────────────────────

describe("malformed input", () => {
  it("skips a transition whose value is not the JSON the backend writes", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "render", atMs: ms(0), state: "Running" }],
        kv: {
          [`transition/render/r1/${String(BigInt(ms(100)) * 1_000_000n)}`]: "not json",
        },
      }),
    );

    expect(summary.line).toMatchObject({ state: "Running" });
  });

  it("skips a state this build does not know, rather than failing", () => {
    // A newer backend may report a state added after this release. The surface is diagnostic:
    // an unknown state is dropped, and the states it does know still show.
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [
          { topic: "render", atMs: ms(0), state: "Running" },
          { topic: "exec", reporter: "cmd1", atMs: ms(100), state: "WaitingForQuantumComputer" },
        ],
      }),
    );

    expect(summary.line).toMatchObject({ state: "Running" });
  });

  it("ignores a key that is not a transition key", () => {
    const summary = foldBlockStatus(
      context({
        id: "r1",
        transitions: [{ topic: "render", atMs: ms(0), state: "Running" }],
        kv: {
          "transition/render/r1": JSON.stringify({ state: "Completed" }),
          "transition/render/r1/not-a-number": JSON.stringify({ state: "Completed" }),
          "attr/exec/cmd1/progress/42": "40",
        },
      }),
    );

    expect(summary).toMatchObject({ done: false, liveNodes: 1 });
    expect(summary.line).toMatchObject({ state: "Running" });
  });

  it("visits a context reachable twice only once", () => {
    const shared = context({
      id: "shared",
      transitions: [{ topic: "exec", atMs: ms(100), state: "WaitingForMachine" }],
    });
    const root: StatusContextNode = {
      id: "r1",
      getData: () => undefined,
      getValue: () => undefined,
      listKeyValuesAsString: () => [],
      listFields: () => ["child/shared", "child/shared-again"],
      traverse: () => shared,
    };

    expect(foldBlockStatus(root)).toMatchObject({ totalNodes: 2, liveNodes: 2 });
  });
});
