import { describe, expect, test } from "vitest";
import { digestDef } from "./digest";
import { inputRowsMax, joinShapes } from "./rules";

/**
 * Shapes are read through the real path: a definition is redacted first, then
 * walked. Anything the redaction drops is therefore also missing here, which is
 * the point — a reading that only works on the raw definition would never be
 * available in production.
 */

describe("join shapes, tree API", () => {
  test("sides keyed alike share their axis and their largest input is known", () => {
    const def = ptableDef(
      inner([
        column("a", [axis("pl7.app/sampleId")], 100),
        column("b", [axis("pl7.app/sampleId")], 200),
      ]),
    );
    const shape = shapes(def, "PTableDef")[0];
    expect(shape.sharedAxes).toEqual(["String|pl7.app/sampleId|"]);
    expect(shape.inputRowsMax).toBe(200);
    expect(shape.disjointPairs).toEqual([]);
  });

  test("sides sharing no axis are reported as disjoint, with the product they bound", () => {
    const def = ptableDef(
      inner([column("a", [axis("s")], 384), column("b", [axis("c")], 2_400_000)]),
    );
    const shape = shapes(def, "PTableDef")[0];
    expect(shape.disjointPairs).toEqual([[0, 1]]);
    expect(shape.rowsUpperBound).toBe(384 * 2_400_000);
  });

  test("an axis under two domains is not a shared axis", () => {
    const def = ptableDef(
      inner([
        column("a", [axis("pl7.app/vdj/clonotypeKey", { "pl7.app/vdj/chain": "IGH" })], 100),
        column("b", [axis("pl7.app/vdj/clonotypeKey", { "pl7.app/vdj/chain": "IGK" })], 200),
      ]),
    );
    const shape = shapes(def, "PTableDef")[0];
    expect(shape.sharedAxes).toEqual([]);
    expect(shape.axisUnion).toHaveLength(2);
  });

  test("a nested join is reached and carries its own path", () => {
    const def = ptableDef(
      inner([
        column("a", [axis("s")], 10),
        inner([column("b", [axis("s")], 20), column("c", [axis("z")], 30)]),
      ]),
    );
    const nested = shapes(def, "PTableDef").find((shape) => shape.path === "root/inner[1]");
    expect(nested?.disjointPairs).toEqual([[0, 1]]);
  });
});

describe("join shapes, V2 query API", () => {
  test("the same disjoint join is read out of a V2 query", () => {
    const def = {
      query: v2Join("innerJoin", [
        column("a", [axis("s")], 384),
        column("b", [axis("c")], 2_400_000),
      ]),
    };
    const shape = shapes(def, "PTableDefV2")[0];
    expect(shape.disjointPairs).toEqual([[0, 1]]);
    expect(shape.rowsUpperBound).toBe(384 * 2_400_000);
  });

  test("a driven join's narrower secondary still shares the key it joins on", () => {
    const def = {
      query: {
        type: "outerJoin",
        primary: { entry: column("a", [axis("s"), axis("c")], 1000) },
        secondary: [{ entry: column("b", [axis("c")], 50) }],
      },
    };
    const shape = shapes(def, "PTableDefV2")[0];
    expect(shape.sharedAxes).toEqual(["String|c|"]);
    expect(shape.disjointPairs).toEqual([]);
  });
});

describe("declared input rows", () => {
  test("row counts come from parquet chunk stats without reading blobs", () => {
    const def = ptableDef(inner([column("a", [axis("s")], 1000), column("b", [axis("s")], 3000)]));
    expect(inputRowsMax(digestDef("PTableDef", def).def)).toBe(3000);
  });

  test("rows stay unknown when the workflow wrote no chunk stats", () => {
    const noStats = {
      type: "column",
      column: {
        id: "x",
        spec: { kind: "PColumn", name: "x", valueType: "Int", axesSpec: [axis("s")] },
        data: {
          type: "ParquetPartitioned",
          partitionKeyLength: 1,
          parts: { "[0]": { data: "b" } },
        },
      },
    };
    const def = ptableDef(inner([noStats, column("b", [axis("s")], 10)]));
    const shape = shapes(def, "PTableDef")[0];
    expect(shape.rowsUpperBound).toBeUndefined();
    expect(shape.inputRowsMax).toBe(10);
  });
});

// Internals

function shapes(def: unknown, kind: "PTableDef" | "PTableDefV2") {
  return joinShapes(digestDef(kind, def).def);
}

function ptableDef(src: unknown): unknown {
  return { src, partitionFilters: [], filters: [], sorting: [] };
}

function inner(entries: unknown[]): unknown {
  return { type: "inner", entries };
}

function v2Join(type: string, columns: unknown[]): unknown {
  return { type, entries: columns.map((entry) => ({ entry })) };
}

function axis(name: string, domain?: Record<string, string>): unknown {
  return { type: "String", name, ...(domain ? { domain } : {}) };
}

function column(name: string, axes: unknown[], rows: number): unknown {
  return {
    type: "column",
    column: {
      id: `id-${name}`,
      spec: { kind: "PColumn", name, valueType: "Int", axesSpec: axes },
      data: {
        type: "ParquetPartitioned",
        partitionKeyLength: 1,
        parts: {
          "[0]": { data: "blob", stats: { numberOfRows: rows, size: { axes: [8], column: 8 } } },
        },
      },
    },
  };
}
