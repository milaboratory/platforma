import type { BlockStatusNode } from "@milaboratories/pl-middle-layer";
import { describe, expect, it } from "vitest";
import { findBlockStatusNode, limitBlockStatusTree } from "./block-status";

function node(
  contextId: string,
  transitions: number,
  children: BlockStatusNode[],
): BlockStatusNode {
  return {
    contextId,
    data: {},
    transitions: Array.from({ length: transitions }, (_, i) => ({
      topic: "core",
      resource: "NG:0x1",
      timestampNs: String(i),
      state: "Running",
      detail: "",
      reason: "",
    })),
    attributes: [],
    children,
  };
}

const tree = node("1", 5, [node("2", 1, [node("3", 0, [node("4", 0, [])])]), node("5", 0, [])]);

describe("limitBlockStatusTree", () => {
  it("keeps the latest transitions and marks the omitted ones", () => {
    const limited = limitBlockStatusTree(tree, { maxDepth: 10, maxTransitions: 2 });

    expect(limited.transitions.map((t) => t.timestampNs)).toEqual(["3", "4"]);
    expect(limited.transitionsOmitted).toBe(3);
    expect(limited.children[0].transitionsOmitted).toBeUndefined();
  });

  it("cuts children below maxDepth and marks the cut nodes", () => {
    const limited = limitBlockStatusTree(tree, { maxDepth: 1, maxTransitions: 10 });

    expect(limited.children.map((c) => c.contextId)).toEqual(["2", "5"]);
    expect(limited.childrenOmitted).toBeUndefined();
    expect(limited.children[0].children).toEqual([]);
    expect(limited.children[0].childrenOmitted).toBe(1);
    expect(limited.children[1].childrenOmitted).toBeUndefined();
  });

  it("returns the node only for depth 0", () => {
    const limited = limitBlockStatusTree(tree, { maxDepth: 0, maxTransitions: 0 });

    expect(limited.children).toEqual([]);
    expect(limited.childrenOmitted).toBe(2);
    expect(limited.transitions).toEqual([]);
    expect(limited.transitionsOmitted).toBe(5);
  });
});

describe("findBlockStatusNode", () => {
  it("finds a nested context and returns undefined for an unknown one", () => {
    expect(findBlockStatusNode(tree, "4")?.contextId).toBe("4");
    expect(findBlockStatusNode(tree, "9")).toBeUndefined();
  });
});
