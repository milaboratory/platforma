import { expect, test } from "vitest";
import type { BlockActionContextNode } from "./block_action_context";
import { summarizeBlockActionContext } from "./block_action_summary";

const ms = 1_000_000;

function context(
  name: string,
  transitions: [namespace: string, resource: string, atMs: number, state: string][],
  children: BlockActionContextNode[] = [],
): BlockActionContextNode {
  return {
    contextId: name,
    baggage: { name },
    transitions: transitions.map(([namespace, resource, atMs, state]) => ({
      namespace,
      resource,
      timestampNs: String(atMs * ms),
      state,
      detail: "",
      reason: "",
    })),
    readings: [],
    children,
  };
}

test("the phase follows the current states of the reporting resources", () => {
  const phase = (tree: BlockActionContextNode) => summarizeBlockActionContext(tree, 1000).phase;

  expect(phase(context("root", []))).toBe("NotStarted");
  expect(phase(context("root", [["render", "1", 1, "Running"]]))).toBe("NotStarted");
  expect(
    phase(
      context("root", [
        ["exec", "2", 1, "Running"],
        ["exec", "2", 2, "Completed"],
      ]),
    ),
  ).toBe("Done");
  expect(phase(context("root", [["exec", "2", 1, "WaitingForMachine"]]))).toBe("Waiting");
  expect(
    phase(
      context("root", [
        ["exec", "2", 1, "WaitingForMachine"],
        ["workdir", "3", 2, "PopulatingWorkdir"],
      ]),
    ),
  ).toBe("Running");
  expect(
    phase(
      context("root", [
        ["exec", "2", 1, "Running"],
        ["exec", "3", 2, "Terminated"],
      ]),
    ),
  ).toBe("Failed");
});

test("active resources come from the whole tree, longest in the state first", () => {
  const tree = context(
    "root",
    [["exec", "2", 300, "WaitingForScheduler"]],
    [
      context("align", [
        ["workdir", "3", 100, "WaitingWorkdirGate"],
        ["workdir", "3", 200, "PopulatingWorkdir"],
      ]),
    ],
  );
  tree.children[0].readings.push({
    namespace: "workdir",
    resource: "3",
    key: "progress",
    value: "1/4",
  });

  const summary = summarizeBlockActionContext(tree, 1000);

  expect(summary.active.map((s) => [s.resource, s.context, s.state, s.inStateMs])).toEqual([
    ["3", "align", "PopulatingWorkdir", 800],
    ["2", "root", "WaitingForScheduler", 700],
  ]);
  expect(summary.active[0].readings).toEqual({ "workdir/progress": "1/4" });
  expect(summary.states).toEqual({ PopulatingWorkdir: 1, WaitingForScheduler: 1 });
});
