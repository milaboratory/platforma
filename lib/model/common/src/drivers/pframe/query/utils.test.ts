import { describe, expect, it } from "vitest";
import type { PObjectId } from "../../../pool";
import type { SpecQuery, SpecQueryJoinEntry } from "./query_spec";
import {
  traverseQuerySpec,
  mapSpecQueryColumns,
  collectSpecQueryColumns,
  sortSpecQuery,
  isBooleanExpression,
} from "./utils";

type Q = SpecQuery<string>;
type JE = SpecQueryJoinEntry<string>;

const col = (c: string): Q => ({ type: "column", column: c });
const entry = (q: Q): JE => ({ entry: q, qualifications: [] });

/** Typed helpers for sortSpecQuery tests (PObjectId is branded). */
const pid = (c: string) => c as PObjectId;
const pcol = (c: string): SpecQuery => ({ type: "column", column: pid(c) });
const pentry = (q: SpecQuery): SpecQueryJoinEntry => ({ entry: q, qualifications: [] });

describe("traverseQuerySpec", () => {
  it("transforms column leaf", () => {
    const result = traverseQuerySpec(col("a"), { column: (c) => c.toUpperCase() });
    expect(result).toEqual({ type: "column", column: "A" });
  });

  it("transforms sparseToDenseColumn leaf", () => {
    const q: Q = { type: "sparseToDenseColumn", column: "a", axesIndices: [0, 1] } as Q;
    const result = traverseQuerySpec(q, { column: (c) => `${c}!` });
    expect(result).toEqual({ type: "sparseToDenseColumn", column: "a!", axesIndices: [0, 1] });
  });

  it("passes inlineColumn through unchanged", () => {
    const q: Q = {
      type: "inlineColumn",
      spec: { id: "x", spec: {} },
      dataInfo: {},
    } as unknown as Q;
    const result = traverseQuerySpec(q, { column: (c) => c.toUpperCase() });
    expect(result).toBe(q);
  });

  it("transforms columns inside innerJoin", () => {
    const q: Q = { type: "innerJoin", entries: [entry(col("a")), entry(col("b"))] };
    const result = traverseQuerySpec(q, { column: (c) => c.toUpperCase() });
    expect(result).toEqual({
      type: "innerJoin",
      entries: [entry({ type: "column", column: "A" }), entry({ type: "column", column: "B" })],
    });
  });

  it("transforms columns inside fullJoin", () => {
    const q: Q = { type: "fullJoin", entries: [entry(col("a"))] };
    const result = traverseQuerySpec(q, { column: (c) => c.toUpperCase() });
    expect(result).toEqual({
      type: "fullJoin",
      entries: [entry({ type: "column", column: "A" })],
    });
  });

  it("transforms columns inside outerJoin", () => {
    const q: Q = {
      type: "outerJoin",
      primary: entry(col("a")),
      secondary: [entry(col("b"))],
    };
    const result = traverseQuerySpec(q, { column: (c) => c.toUpperCase() });
    expect(result).toEqual({
      type: "outerJoin",
      primary: entry({ type: "column", column: "A" }),
      secondary: [entry({ type: "column", column: "B" })],
    });
  });

  it("transforms columns inside filter", () => {
    const q: Q = {
      type: "filter",
      input: col("a"),
      predicate: { type: "isNull", input: { type: "columnRef", value: pid("id1") } },
    } as Q;
    const result = traverseQuerySpec(q, { column: (c) => c.toUpperCase() });
    expect(result).toEqual({
      type: "filter",
      input: { type: "column", column: "A" },
      predicate: { type: "isNull", input: { type: "columnRef", value: "id1" } },
    });
  });

  it("transforms columns inside sort", () => {
    const q: Q = {
      type: "sort",
      input: col("a"),
      sortBy: [
        { expression: { type: "columnRef", value: pid("id1") }, ascending: true, nullsFirst: null },
      ],
    } as Q;
    const result = traverseQuerySpec(q, { column: (c) => c.toUpperCase() });
    expect(result).toEqual({
      type: "sort",
      input: { type: "column", column: "A" },
      sortBy: [
        { expression: { type: "columnRef", value: "id1" }, ascending: true, nullsFirst: null },
      ],
    });
  });

  it("transforms nested structure", () => {
    const q: Q = {
      type: "filter",
      input: {
        type: "outerJoin",
        primary: entry(col("a")),
        secondary: [entry(col("b")), entry(col("c"))],
      },
      predicate: { type: "isNull", input: { type: "columnRef", value: pid("id1") } },
    } as Q;
    const result = traverseQuerySpec(q, { column: (c) => c.toUpperCase() });
    expect(collectSpecQueryColumns(result)).toEqual(["A", "B", "C"]);
  });

  it("calls node visitor after children are traversed", () => {
    const q: Q = { type: "innerJoin", entries: [entry(col("a")), entry(col("b"))] };
    const visited: string[] = [];
    traverseQuerySpec(q, {
      column: (c) => c,
      node: (node) => {
        visited.push(node.type);
        return node;
      },
    });
    expect(visited).toEqual(["column", "column", "innerJoin"]);
  });

  it("calls joinEntry visitor for each entry", () => {
    const q: Q = { type: "innerJoin", entries: [entry(col("a")), entry(col("b"))] };
    const visited: string[] = [];
    traverseQuerySpec(q, {
      column: (c) => c,
      joinEntry: (e) => {
        if (e.entry.type === "column") visited.push(e.entry.column);
        return e;
      },
    });
    expect(visited).toEqual(["a", "b"]);
  });
});

describe("mapSpecQueryColumns", () => {
  it("maps all column references", () => {
    const q: Q = {
      type: "outerJoin",
      primary: entry(col("a")),
      secondary: [entry(col("b"))],
    };
    const result = mapSpecQueryColumns(q, (c) => c.toUpperCase());
    expect(collectSpecQueryColumns(result)).toEqual(["A", "B"]);
  });
});

describe("collectSpecQueryColumns", () => {
  it("collects from a single column", () => {
    expect(collectSpecQueryColumns(col("a"))).toEqual(["a"]);
  });

  it("collects from join", () => {
    const q: Q = { type: "innerJoin", entries: [entry(col("a")), entry(col("b"))] };
    expect(collectSpecQueryColumns(q)).toEqual(["a", "b"]);
  });

  it("collects from nested structure", () => {
    const q: Q = {
      type: "filter",
      input: {
        type: "outerJoin",
        primary: entry(col("x")),
        secondary: [entry(col("y")), entry(col("z"))],
      },
      predicate: { type: "isNull", input: { type: "columnRef", value: pid("id1") } },
    } as Q;
    expect(collectSpecQueryColumns(q)).toEqual(["x", "y", "z"]);
  });

  it("collects from sparseToDenseColumn", () => {
    const q: Q = { type: "sparseToDenseColumn", column: "s", axesIndices: [0] } as Q;
    expect(collectSpecQueryColumns(q)).toEqual(["s"]);
  });

  it("returns empty for inlineColumn", () => {
    const q: Q = {
      type: "inlineColumn",
      spec: { id: "x", spec: {} },
      dataInfo: {},
    } as unknown as Q;
    expect(collectSpecQueryColumns(q)).toEqual([]);
  });
});

describe("sortSpecQuery", () => {
  it("sorts innerJoin entries by column id", () => {
    const q: SpecQuery = { type: "innerJoin", entries: [pentry(pcol("b")), pentry(pcol("a"))] };
    const result = sortSpecQuery(q);
    expect(result).toEqual({
      type: "innerJoin",
      entries: [pentry(pcol("a")), pentry(pcol("b"))],
    });
  });

  it("sorts outerJoin secondary entries", () => {
    const q: SpecQuery = {
      type: "outerJoin",
      primary: pentry(pcol("p")),
      secondary: [pentry(pcol("c")), pentry(pcol("a")), pentry(pcol("b"))],
    };
    const result = sortSpecQuery(q);
    expect(result).toEqual({
      type: "outerJoin",
      primary: pentry(pcol("p")),
      secondary: [pentry(pcol("a")), pentry(pcol("b")), pentry(pcol("c"))],
    });
  });

  it("sorts sparseToDenseColumn axesIndices", () => {
    const q: SpecQuery = {
      type: "sparseToDenseColumn",
      column: pid("a"),
      axesIndices: [2, 0, 1],
    } as SpecQuery;
    const result = sortSpecQuery(q);
    expect(result).toEqual({
      type: "sparseToDenseColumn",
      column: "a",
      axesIndices: [0, 1, 2],
    });
  });

  it("sorts join entry qualifications", () => {
    const q: SpecQuery = {
      type: "innerJoin",
      entries: [
        {
          entry: pcol("a"),
          qualifications: [
            { axis: { name: "z" }, additionalDomains: {} },
            { axis: { name: "a" }, additionalDomains: {} },
          ],
        },
      ],
    };
    const result = sortSpecQuery(q);
    const entries = (result as { type: "innerJoin"; entries: SpecQueryJoinEntry[] }).entries;
    expect(entries[0].qualifications[0].axis).toEqual({ name: "a" });
    expect(entries[0].qualifications[1].axis).toEqual({ name: "z" });
  });

  it("sorts nested structures recursively", () => {
    const q: SpecQuery = {
      type: "filter",
      input: { type: "innerJoin", entries: [pentry(pcol("b")), pentry(pcol("a"))] },
      predicate: { type: "isNull", input: { type: "columnRef", value: pid("id1") } },
    };
    const result = sortSpecQuery(q);
    const inner = (result as { type: "filter"; input: SpecQuery }).input;
    expect(collectSpecQueryColumns(inner)).toEqual(["a", "b"]);
  });

  it("leaves column leaf unchanged", () => {
    const q: SpecQuery = pcol("a");
    expect(sortSpecQuery(q)).toEqual(pcol("a"));
  });
});

describe("isBooleanExpression", () => {
  it("returns true for boolean expression types", () => {
    expect(
      isBooleanExpression({ type: "isNull", input: { type: "columnRef", value: pid("a") } }),
    ).toBe(true);
    expect(
      isBooleanExpression({
        type: "not",
        input: { type: "isNull", input: { type: "columnRef", value: pid("a") } },
      }),
    ).toBe(true);
    expect(isBooleanExpression({ type: "and", input: [] })).toBe(true);
  });

  it("returns false for non-boolean expression types", () => {
    expect(isBooleanExpression({ type: "columnRef", value: pid("a") })).toBe(false);
    expect(isBooleanExpression({ type: "axisRef", value: { name: "x" } })).toBe(false);
    expect(isBooleanExpression({ type: "constant", value: 42 })).toBe(false);
  });
});
