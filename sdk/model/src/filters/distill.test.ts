import { describe, expect, it } from "vitest";
import type { FilterSpec, FilterSpecLeaf } from "@milaboratories/pl-model-common";
import { distillFilterSpec } from "./distill";

type F = FilterSpec<FilterSpecLeaf<string>>;

const leaf: F = { type: "equal", column: "c1", x: 1 };
const emptyLeaf: F = { type: undefined };
const incompleteLeaf: F = { type: "equal", column: "c1", x: undefined as unknown as number };

describe("distillFilterSpec", () => {
  it("returns null for null input", () => {
    expect(distillFilterSpec(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(distillFilterSpec(undefined)).toBeNull();
  });

  it("returns valid leaf as-is", () => {
    expect(distillFilterSpec(leaf)).toEqual(leaf);
  });

  it("returns null for empty leaf", () => {
    expect(distillFilterSpec(emptyLeaf)).toBeNull();
  });

  it("returns null for incomplete leaf", () => {
    expect(distillFilterSpec(incompleteLeaf)).toBeNull();
  });

  // --- distill (strips extra metadata) ---

  it("strips non-FilterSpec metadata from leaf", () => {
    const leafWithMeta = { type: "equal" as const, column: "c1", x: 1, _extra: true, label: "hi" };
    expect(distillFilterSpec(leafWithMeta)).toEqual({ type: "equal", column: "c1", x: 1 });
  });

  it("strips non-FilterSpec metadata from nested nodes", () => {
    const filter = {
      type: "and" as const,
      filters: [{ type: "equal" as const, column: "c1", x: 1, _meta: "remove" }],
      _rootMeta: 42,
    };
    expect(distillFilterSpec(filter)).toEqual({
      type: "and",
      filters: [{ type: "equal", column: "c1", x: 1 }],
    });
  });

  // --- and ---

  it("filters out empty children from and", () => {
    const filter: F = { type: "and", filters: [emptyLeaf, leaf, emptyLeaf] };
    expect(distillFilterSpec(filter)).toEqual({ type: "and", filters: [leaf] });
  });

  it("returns null when all and children are empty", () => {
    const filter: F = { type: "and", filters: [emptyLeaf, emptyLeaf] };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  it("returns null for and with no children", () => {
    const filter: F = { type: "and", filters: [] };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  // --- or ---

  it("filters out empty children from or", () => {
    const leaf2: F = { type: "equal", column: "c2", x: 2 };
    const filter: F = { type: "or", filters: [leaf, emptyLeaf, leaf2] };
    expect(distillFilterSpec(filter)).toEqual({ type: "or", filters: [leaf, leaf2] });
  });

  it("returns null when all or children are empty", () => {
    const filter: F = { type: "or", filters: [emptyLeaf] };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  // --- not ---

  it("preserves not with valid inner filter", () => {
    const filter: F = { type: "not", filter: leaf };
    expect(distillFilterSpec(filter)).toEqual({ type: "not", filter: leaf });
  });

  it("returns null for not wrapping an empty filter", () => {
    const filter: F = { type: "not", filter: emptyLeaf };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  // --- nested collapse ---

  it("returns null when nested and collapses", () => {
    const filter: F = {
      type: "not",
      filter: { type: "and", filters: [emptyLeaf] },
    };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  it("returns null when parent and has only a collapsing child", () => {
    const filter: F = {
      type: "and",
      filters: [{ type: "or", filters: [emptyLeaf] }],
    };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  it("keeps valid siblings when one child collapses", () => {
    const filter: F = {
      type: "and",
      filters: [{ type: "or", filters: [emptyLeaf] }, leaf],
    };
    expect(distillFilterSpec(filter)).toEqual({ type: "and", filters: [leaf] });
  });

  // --- unfilled fields (at least one undefined field drops the leaf) ---

  it("returns null for leaf with undefined column", () => {
    const filter: F = { type: "equal", column: undefined as unknown as string, x: 1 };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  it("returns null for leaf with undefined value (string filter)", () => {
    const filter: F = {
      type: "patternEquals",
      column: "c1",
      value: undefined as unknown as string,
    };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  it("returns null for greaterThan with undefined x", () => {
    const filter: F = {
      type: "greaterThan",
      column: "c1",
      x: undefined as unknown as number,
    };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  it("returns null for topN with undefined n", () => {
    const filter: F = {
      type: "topN",
      column: "c1",
      n: undefined as unknown as number,
    };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  it("returns null for inSet with undefined value", () => {
    const filter: F = {
      type: "inSet",
      column: "c1",
      value: undefined as unknown as string[],
    };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  it("drops incomplete leaf from and, keeps filled siblings", () => {
    const incomplete: F = { type: "greaterThan", column: "c1", x: undefined as unknown as number };
    const filter: F = { type: "and", filters: [leaf, incomplete] };
    expect(distillFilterSpec(filter)).toEqual({ type: "and", filters: [leaf] });
  });

  it("drops incomplete leaf from or, keeps filled siblings", () => {
    const incomplete: F = {
      type: "patternEquals",
      column: "c1",
      value: undefined as unknown as string,
    };
    const leaf2: F = { type: "equal", column: "c2", x: 2 };
    const filter: F = { type: "or", filters: [incomplete, leaf2] };
    expect(distillFilterSpec(filter)).toEqual({ type: "or", filters: [leaf2] });
  });

  it("returns null for not wrapping an incomplete leaf", () => {
    const incomplete: F = { type: "equal", column: undefined as unknown as string, x: 1 };
    const filter: F = { type: "not", filter: incomplete };
    expect(distillFilterSpec(filter)).toBeNull();
  });

  it("returns null when and contains only incomplete leaves", () => {
    const a: F = { type: "equal", column: "c1", x: undefined as unknown as number };
    const b: F = { type: "greaterThan", column: undefined as unknown as string, x: 5 };
    const filter: F = { type: "and", filters: [a, b] };
    expect(distillFilterSpec(filter)).toBeNull();
  });
});
