import { describe, expect, it } from "vitest";
import { foldBlockStatusPanel } from "./block_status_panel";
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

describe("foldBlockStatusPanel", () => {
  it("opens the root to its top-level nodes and leaves their subtrees collapsed", () => {
    const panel = foldBlockStatusPanel(
      context({
        id: "root",
        data: { name: "my block", "run-id": "run-1" },
        children: [{ id: "a", children: [{ id: "a1" }] }, { id: "b" }],
      }),
      none,
    );

    expect(panel.root?.name).toBe("my block");
    expect(panel.root?.baggage).toEqual({ "run-id": "run-1" });
    expect(panel.root?.children?.map((c) => c.contextId)).toEqual(["a", "b"]);
    expect(panel.root?.children?.[0]).toMatchObject({ childCount: 1, subtreeNodes: 2 });
    expect(panel.root?.children?.[0].children).toBeUndefined();
  });

  it("shows the children of an expanded node in place", () => {
    const panel = foldBlockStatusPanel(
      context({
        id: "root",
        children: [{ id: "a", children: [{ id: "a1", data: { name: "deep" } }] }],
      }),
      new Set(["a"]),
    );

    expect(panel.root?.children?.[0].children?.map((c) => c.name)).toEqual(["deep"]);
  });

  it("describes a node: kind, state with its entry time, and the last transition whatever its state", () => {
    const panel = foldBlockStatusPanel(
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

    expect(panel.root?.children?.[0]).toMatchObject({
      kind: "command",
      state: "WaitingForMachine",
      enteredAt: ms(0),
      transitions: [
        { namespace: "exec", reporter: "cmd", state: "WaitingForMachine", at: ms(0) },
        { namespace: "exec", reporter: "cmd", state: "SomeFutureState", detail: "x", at: ms(5) },
      ],
    });
  });

  it("lists readings, grouped by namespace and then by the resource that wrote them", () => {
    const panel = foldBlockStatusPanel(
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

    expect(panel.root?.readings.map((a) => `${a.namespace}/${a.resource}/${a.key}`)).toEqual([
      "exec/cmd-1/peak-ram",
      "workdir/wd-1/progress",
      "workdir/wd-2/progress",
    ]);
  });

  it("reports the termination reason of a failed render", () => {
    const panel = foldBlockStatusPanel(
      context({
        id: "root",
        transitions: [
          { namespace: "render", atMs: ms(0), state: "Terminated", reason: "OOM killed" },
        ],
      }),
      none,
    );

    expect(panel.root).toMatchObject({ ended: true, failure: "OOM killed" });
  });

  it("counts compute per subtree, a running command up to the run's latest report", () => {
    const panel = foldBlockStatusPanel(
      context({
        id: "root",
        children: [sample("done", 0, 60_000), sample("running", 30_000)],
        // The latest report anywhere in the run.
        transitions: [{ namespace: "render", atMs: ms(90_000), state: "Running" }],
      }),
      none,
    );

    const [done, running] = panel.root!.children!;
    expect(done.subtreeComputeMs).toBe(60_000);
    expect(running.subtreeComputeMs).toBe(60_000);
    expect(panel.root?.subtreeComputeMs).toBe(120_000);
    expect(panel.root).toMatchObject({ subtreeNodes: 3, subtreeLiveNodes: 2 });
  });

  it("ranks the top-level branches by compute and by node count, largest first", () => {
    const panel = foldBlockStatusPanel(
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

    expect(panel.heaviest.byCompute.map((b) => [b.name, b.value])).toEqual([
      ["sample big", 50_000],
      ["sample mid", 10_000],
      ["sample small", 1_000],
    ]);
    expect(panel.heaviest.byNodes[0]).toMatchObject({ contextId: "big", value: 3 });
    expect(panel.heaviest.byFileSize).toBeUndefined();
  });

  it("carries the same summary the status line is built from", () => {
    const panel = foldBlockStatusPanel(context({ id: "root", children: [sample("a", 0)] }), none);

    expect(panel.summary.byState[0]).toMatchObject({ state: "Running", onMachine: true, nodes: 1 });
  });
});
