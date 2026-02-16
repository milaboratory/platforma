import { describe, expect, it } from "vitest";
import type { FilterSpec, FilterSpecLeaf } from "@milaboratories/pl-model-common";
import { filterEmptyPeaces, filterPredicate } from "./filterEmpty";

type F = FilterSpec<FilterSpecLeaf<string>>;

const leaf: F = { type: "equal", column: "c1", x: 1 };
const emptyLeaf: F = { type: undefined };
const incompleteLeaf: F = { type: "equal", column: "c1", x: undefined as unknown as number };

describe("filterPredicate", () => {
  it("returns false for undefined type", () => {
    expect(filterPredicate(emptyLeaf)).toBe(false);
  });

  it("returns true for a valid leaf", () => {
    expect(filterPredicate(leaf)).toBe(true);
  });

  it("returns false for a leaf with undefined values", () => {
    expect(filterPredicate(incompleteLeaf)).toBe(false);
  });

  it("returns false for and with empty filters", () => {
    expect(filterPredicate({ type: "and", filters: [] })).toBe(false);
  });

  it("returns true for and with filters", () => {
    expect(filterPredicate({ type: "and", filters: [leaf] })).toBe(true);
  });

  it("returns false for or with empty filters", () => {
    expect(filterPredicate({ type: "or", filters: [] })).toBe(false);
  });

  it("returns false for not wrapping an empty filter", () => {
    expect(filterPredicate({ type: "not", filter: emptyLeaf })).toBe(false);
  });

  it("returns true for not wrapping a valid filter", () => {
    expect(filterPredicate({ type: "not", filter: leaf })).toBe(true);
  });
});

describe("filterEmptyPeaces", () => {
  it("returns valid leaf as-is", () => {
    expect(filterEmptyPeaces(leaf)).toEqual(leaf);
  });

  it("returns null for empty leaf", () => {
    expect(filterEmptyPeaces(emptyLeaf)).toBeNull();
  });

  it("returns null for incomplete leaf", () => {
    expect(filterEmptyPeaces(incompleteLeaf)).toBeNull();
  });

  // --- and ---

  it("filters out empty children from and", () => {
    const filter: F = { type: "and", filters: [emptyLeaf, leaf, emptyLeaf] };
    expect(filterEmptyPeaces(filter)).toEqual({ type: "and", filters: [leaf] });
  });

  it("returns null when all and children are empty", () => {
    const filter: F = { type: "and", filters: [emptyLeaf, emptyLeaf] };
    expect(filterEmptyPeaces(filter)).toBeNull();
  });

  it("returns null for and with no children", () => {
    const filter: F = { type: "and", filters: [] };
    expect(filterEmptyPeaces(filter)).toBeNull();
  });

  // --- or ---

  it("filters out empty children from or", () => {
    const leaf2: F = { type: "equal", column: "c2", x: 2 };
    const filter: F = { type: "or", filters: [leaf, emptyLeaf, leaf2] };
    expect(filterEmptyPeaces(filter)).toEqual({ type: "or", filters: [leaf, leaf2] });
  });

  it("returns null when all or children are empty", () => {
    const filter: F = { type: "or", filters: [emptyLeaf] };
    expect(filterEmptyPeaces(filter)).toBeNull();
  });

  // --- not ---

  it("preserves not with valid inner filter", () => {
    const filter: F = { type: "not", filter: leaf };
    expect(filterEmptyPeaces(filter)).toEqual({ type: "not", filter: leaf });
  });

  it("returns null for not wrapping an empty filter", () => {
    const filter: F = { type: "not", filter: emptyLeaf };
    expect(filterEmptyPeaces(filter)).toBeNull();
  });

  // --- nested collapse ---

  it("returns null when nested and collapses", () => {
    const filter: F = {
      type: "not",
      filter: { type: "and", filters: [emptyLeaf] },
    };
    expect(filterEmptyPeaces(filter)).toBeNull();
  });

  it("returns null when parent and has only a collapsing child", () => {
    const filter: F = {
      type: "and",
      filters: [{ type: "or", filters: [emptyLeaf] }],
    };
    expect(filterEmptyPeaces(filter)).toBeNull();
  });

  it("keeps valid siblings when one child collapses", () => {
    const filter: F = {
      type: "and",
      filters: [{ type: "or", filters: [emptyLeaf] }, leaf],
    };
    expect(filterEmptyPeaces(filter)).toEqual({ type: "and", filters: [leaf] });
  });
});
