import { describe, expect, it } from "vitest";
import type { FilterSpec, FilterSpecLeaf } from "@milaboratories/pl-model-common";
import { traverseFilterSpec, collectFilterSpecColumns } from "./traverse";

type F = FilterSpec<FilterSpecLeaf<string>>;

const eq1: F = { type: "equal", column: "c1", x: 1 };
const eq2: F = { type: "equal", column: "c2", x: 2 };
const gt: F = { type: "greaterThan", column: "c3", x: 10 };
const empty: F = { type: undefined };

/** Visitor that collects leaf types into a string expression. */
const toStringVisitor = {
  leaf: (l: FilterSpecLeaf<unknown>) => l.type ?? "empty",
  and: (r: string[]) => `(${r.join(" & ")})`,
  or: (r: string[]) => `(${r.join(" | ")})`,
  not: (r: string) => `!${r}`,
};

describe("traverseFilterSpec", () => {
  it("visits a leaf node", () => {
    expect(traverseFilterSpec(eq1, toStringVisitor)).toBe("equal");
  });

  it("visits an and node", () => {
    const filter: F = { type: "and", filters: [eq1, gt] };
    expect(traverseFilterSpec(filter, toStringVisitor)).toBe("(equal & greaterThan)");
  });

  it("visits an or node", () => {
    const filter: F = { type: "or", filters: [eq1, eq2] };
    expect(traverseFilterSpec(filter, toStringVisitor)).toBe("(equal | equal)");
  });

  it("visits a not node", () => {
    const filter: F = { type: "not", filter: eq1 };
    expect(traverseFilterSpec(filter, toStringVisitor)).toBe("!equal");
  });

  it("handles nested structure", () => {
    const filter: F = {
      type: "and",
      filters: [
        { type: "not", filter: eq1 },
        { type: "or", filters: [eq2, gt] },
      ],
    };
    expect(traverseFilterSpec(filter, toStringVisitor)).toBe("(!equal & (equal | greaterThan))");
  });

  it("skips { type: undefined } entries in and", () => {
    const filter: F = { type: "and", filters: [empty, eq1, empty] };
    expect(traverseFilterSpec(filter, toStringVisitor)).toBe("(equal)");
  });

  it("skips { type: undefined } entries in or", () => {
    const filter: F = { type: "or", filters: [empty, eq1, empty, eq2] };
    expect(traverseFilterSpec(filter, toStringVisitor)).toBe("(equal | equal)");
  });

  it("returns empty and when all children are undefined", () => {
    const filter: F = { type: "and", filters: [empty, empty] };
    expect(traverseFilterSpec(filter, toStringVisitor)).toBe("()");
  });

  it("returns empty or when all children are undefined", () => {
    const filter: F = { type: "or", filters: [empty] };
    expect(traverseFilterSpec(filter, toStringVisitor)).toBe("()");
  });

  it("works with CommonNode/CommonLeaf metadata", () => {
    type MetaLeaf = FilterSpecLeaf<string>;
    type MetaFilter = FilterSpec<MetaLeaf, { _id: number }, { _id: number }>;

    const filter: MetaFilter = {
      type: "and",
      _id: 1,
      filters: [
        { type: "equal", column: "c1", x: 1, _id: 2 },
        { type: "greaterThan", column: "c2", x: 5, _id: 3 },
      ],
    };

    const result = traverseFilterSpec(filter, {
      leaf: (l) => [l._id],
      and: (r) => r.flat(),
      or: (r) => r.flat(),
      not: (r) => r,
    });

    expect(result).toEqual([2, 3]);
  });
});

describe("collectFilterSpecColumns", () => {
  it("collects column from a single leaf", () => {
    expect(collectFilterSpecColumns(eq1)).toEqual(["c1"]);
  });

  it("collects columns from and", () => {
    const filter: F = { type: "and", filters: [eq1, eq2, gt] };
    expect(collectFilterSpecColumns(filter)).toEqual(["c1", "c2", "c3"]);
  });

  it("collects columns from nested structure", () => {
    const filter: F = {
      type: "or",
      filters: [
        { type: "not", filter: eq1 },
        { type: "and", filters: [eq2, gt] },
      ],
    };
    expect(collectFilterSpecColumns(filter)).toEqual(["c1", "c2", "c3"]);
  });

  it("collects rhs fields", () => {
    const filter: F = { type: "greaterThan", column: "c1", rhs: "c2", x: 5 } as F;
    expect(collectFilterSpecColumns(filter)).toEqual(["c1", "c2"]);
  });

  it("skips { type: undefined } entries", () => {
    const filter: F = { type: "and", filters: [empty, eq1, empty] };
    expect(collectFilterSpecColumns(filter)).toEqual(["c1"]);
  });

  it("returns empty array for all-empty and", () => {
    const filter: F = { type: "and", filters: [empty, empty] };
    expect(collectFilterSpecColumns(filter)).toEqual([]);
  });

  it("returns empty array for leaf without column", () => {
    const filter: F = { type: "isNA" } as F;
    expect(collectFilterSpecColumns(filter)).toEqual([]);
  });
});
