import { describe, expect, it } from "vitest";
import { foldBlockStatusTree } from "./block_status_tree_fold";
import type { ContextFixture } from "./block_status_test_utils";
import { context, ms, renderCompleted } from "./block_status_test_utils";

const none = new Set<string>();

/** A sample render whose command ran on a machine from `from` to `to`, or is still running. */
function sample(id: string, from: number, to?: number): ContextFixture {
  return {
    id,
    data: { name: `sample ${id}` },
    transitions: [
      { namespace: "render", atMs: ms(from - 1_000), state: "Running" },
      { namespace: "exec", reporter: `cmd-${id}`, atMs: ms(from), state: "Running" },
      ...(to === undefined
        ? []
        : [
            { namespace: "exec", reporter: `cmd-${id}`, atMs: ms(to), state: "Completed" },
            renderCompleted(ms(to)),
          ]),
    ],
  };
}

describe("foldBlockStatusTree", () => {
  it("opens the root to its top-level nodes and leaves their subtrees collapsed", () => {
    const tree = foldBlockStatusTree(
      context({
        id: "root",
        data: { name: "my block", "run-id": "run-1" },
        children: [{ id: "a", children: [{ id: "a1" }] }, { id: "b" }],
      }),
      none,
    );

    expect(tree.root?.name).toBe("my block");
    expect(tree.root?.baggage).toEqual({ "run-id": "run-1" });
    expect(tree.root?.children?.map((c) => c.contextId)).toEqual(["a", "b"]);
    expect(tree.root?.children?.[0]).toMatchObject({ childCount: 1, subtreeContexts: 2 });
    expect(tree.root?.children?.[0].children).toBeUndefined();
  });

  it("shows the children of an expanded node in place", () => {
    const tree = foldBlockStatusTree(
      context({
        id: "root",
        children: [{ id: "a", children: [{ id: "a1", data: { name: "deep" } }] }],
      }),
      new Set(["a"]),
    );

    expect(tree.root?.children?.[0].children?.map((c) => c.name)).toEqual(["deep"]);
  });

  it("describes a node: kind, the state holding it as its reporter wrote it, and every transition", () => {
    const tree = foldBlockStatusTree(
      context({
        id: "root",
        children: [
          {
            id: "c",
            transitions: [
              { namespace: "exec", reporter: "cmd", atMs: ms(0), state: "WaitingForMachine" },
              {
                namespace: "exec",
                reporter: "cmd",
                atMs: ms(5),
                state: "SomeFutureState",
                detail: "x",
              },
            ],
          },
        ],
      }),
      none,
    );

    expect(tree.root?.children?.[0]).toMatchObject({
      kind: "command",
      state: "SomeFutureState",
      enteredAt: ms(5),
      transitions: [
        { namespace: "exec", reporter: "cmd", state: "WaitingForMachine", at: ms(0) },
        { namespace: "exec", reporter: "cmd", state: "SomeFutureState", detail: "x", at: ms(5) },
      ],
    });
  });

  it("lists readings, grouped by namespace and then by the resource that wrote them", () => {
    const tree = foldBlockStatusTree(
      context({
        id: "root",
        kv: {
          "reading/workdir/wd-2/progress": '{"done":1,"total":2}',
          "reading/exec/cmd-1/peak-ram": "512Mi",
          "reading/workdir/wd-1/progress": '{"done":3,"total":3}',
          "reading/malformed": "dropped",
        },
      }),
      none,
    );

    expect(tree.root?.readings.map((a) => `${a.namespace}/${a.resource}/${a.key}`)).toEqual([
      "exec/cmd-1/peak-ram",
      "workdir/wd-1/progress",
      "workdir/wd-2/progress",
    ]);
  });

  it("reports the termination reason of a failed render", () => {
    const tree = foldBlockStatusTree(
      context({
        id: "root",
        transitions: [
          { namespace: "render", atMs: ms(0), state: "Terminated", reason: "OOM killed" },
        ],
      }),
      none,
    );

    expect(tree.root).toMatchObject({ ended: true, failure: "OOM killed" });
  });

  it("ends every node a cancelled run left unfinished, and keeps finished ones as they were", () => {
    const tree = foldBlockStatusTree(
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
        children: [sample("done", 1_000, 5_000), sample("busy", 10_000)],
      }),
      none,
    );

    const [done, busy] = tree.root?.children ?? [];
    expect(done).toMatchObject({ ended: true, failure: undefined });
    expect(busy).toMatchObject({ ended: true, failure: "cancelled", onMachine: false });
    expect(busy?.state).toBeUndefined();
    expect(tree.root?.subtreeActiveContexts).toBe(0);
  });

  it("counts compute per subtree, a running command up to the run's latest report", () => {
    const tree = foldBlockStatusTree(
      context({
        id: "root",
        children: [sample("done", 0, 60_000), sample("running", 30_000)],
        // The latest report anywhere in the run.
        transitions: [{ namespace: "render", atMs: ms(90_000), state: "Running" }],
      }),
      none,
    );

    const [done, running] = tree.root!.children!;
    expect(done.subtreeComputeMs).toBe(60_000);
    expect(running.subtreeComputeMs).toBe(60_000);
    expect(tree.root?.subtreeComputeMs).toBe(120_000);
    expect(tree.root).toMatchObject({ subtreeContexts: 3, subtreeActiveContexts: 2 });
  });

  it("ranks the top-level branches by compute and by context count, largest first", () => {
    const tree = foldBlockStatusTree(
      context({
        id: "root",
        children: [
          sample("small", 0, 1_000),
          { ...sample("big", 0, 50_000), children: [{ id: "x" }, { id: "y" }] },
          sample("mid", 0, 10_000),
        ],
      }),
      none,
    );

    expect(tree.heaviest.byCompute.map((b) => [b.name, b.value])).toEqual([
      ["sample big", 50_000],
      ["sample mid", 10_000],
      ["sample small", 1_000],
    ]);
    expect(tree.heaviest.byContexts[0]).toMatchObject({ contextId: "big", value: 3 });
    expect(tree.heaviest.byFileSize).toBeUndefined();
  });

  it("carries the run's summary", () => {
    const tree = foldBlockStatusTree(context({ id: "root", children: [sample("a", 0)] }), none);

    expect(tree.summary.jobs).toMatchObject({
      total: 1,
      byState: [{ namespace: "exec", state: "Running", count: 1 }],
    });
  });
});

describe("firstFailurePath", () => {
  it("leads from the root to the render that terminated first", () => {
    const failed = (id: string, atMs: number): ContextFixture => ({
      id,
      transitions: [{ namespace: "render", atMs, state: "Terminated", reason: "boom" }],
    });
    const tree = foldBlockStatusTree(
      context({
        id: "root",
        children: [
          { id: "a", children: [failed("late", ms(900))] },
          { id: "b", children: [{ id: "b1", children: [failed("early", ms(100))] }] },
        ],
      }),
      none,
    );

    expect(tree.firstFailurePath).toEqual(["root", "b", "b1", "early"]);
  });

  it("is undefined while nothing has terminated", () => {
    expect(foldBlockStatusTree(context({ id: "root" }), none).firstFailurePath).toBeUndefined();
  });
});
