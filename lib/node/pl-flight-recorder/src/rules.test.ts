import { describe, expect, test } from "vitest";
import { digestDef } from "./digest";
import { inputRowsMax, joinShapes, structuralFindings } from "./rules";

/**
 * The rules are exercised through the real path: a definition is redacted first,
 * then read. Anything the redaction drops is therefore also missing here, which
 * is the point — a rule that only works on the raw definition would never fire
 * in production.
 */

describe("structural findings, tree API", () => {
  test("identical axes produce no finding", () => {
    const def = ptableDef(
      inner([
        column("a", [axis("pl7.app/sampleId")], 100),
        column("b", [axis("pl7.app/sampleId")], 200),
      ]),
    );
    expect(findings(def, "PTableDef")).toEqual([]);
    const shape = shapes(def, "PTableDef")[0];
    expect(shape.sharedAxes).toEqual(["String|pl7.app/sampleId|"]);
    expect(shape.inputRowsMax).toBe(200);
  });

  test("siblings with no shared axis are a cross join with a row bound", () => {
    const def = ptableDef(
      inner([column("a", [axis("s")], 384), column("b", [axis("c")], 2_400_000)]),
    );
    const cross = findings(def, "PTableDef").find((f) => f.rule === "cross-join");
    expect(cross?.severity).toBe("critical");
    expect(shapes(def, "PTableDef")[0].rowsUpperBound).toBe(384 * 2_400_000);
  });

  test("same axis under different domains is named as a domain mismatch", () => {
    const def = ptableDef(
      inner([
        column("a", [axis("pl7.app/vdj/clonotypeKey", { "pl7.app/vdj/chain": "IGH" })], 100),
        column("b", [axis("pl7.app/vdj/clonotypeKey", { "pl7.app/vdj/chain": "IGK" })], 200),
      ]),
    );
    const mismatch = findings(def, "PTableDef").find((f) => f.rule === "axis-domain-mismatch");
    expect(mismatch?.severity).toBe("high");
    expect(mismatch?.domains).toHaveLength(2);
  });

  test("fan-out is reported for an inner join that still has a working key", () => {
    const def = ptableDef(
      inner([column("a", [axis("s")], 100), column("b", [axis("s"), axis("c")], 5000)]),
    );
    expect(findings(def, "PTableDef").map((f) => f.rule)).toEqual(["partial-key-fan-out"]);
  });

  test("fan-out is not restated on a cartesian node", () => {
    const def = ptableDef(inner([column("a", [axis("s")], 10), column("b", [axis("c")], 10)]));
    expect(findings(def, "PTableDef").some((f) => f.rule === "partial-key-fan-out")).toBe(false);
  });

  test("an outer join's narrower secondary is not a finding", () => {
    const def = ptableDef({
      type: "outer",
      primary: column("a", [axis("s"), axis("c")], 1000),
      secondary: [column("b", [axis("c")], 50)],
    });
    expect(findings(def, "PTableDef")).toEqual([]);
  });

  test("a nested join is reached and reported by its path", () => {
    const def = ptableDef(
      inner([
        column("a", [axis("s")], 10),
        inner([column("b", [axis("s")], 20), column("c", [axis("z")], 30)]),
      ]),
    );
    const cross = findings(def, "PTableDef").find((f) => f.rule === "cross-join");
    expect(cross?.path).toBe("root/inner[1]");
  });
});

describe("structural findings, V2 query API", () => {
  test("the same cross join is found in a V2 query", () => {
    const def = {
      query: v2Join("innerJoin", [
        column("a", [axis("s")], 384),
        column("b", [axis("c")], 2_400_000),
      ]),
    };
    const found = findings(def, "PTableDefV2");
    expect(found.map((f) => f.rule)).toContain("cross-join");
    expect(shapes(def, "PTableDefV2")[0].rowsUpperBound).toBe(384 * 2_400_000);
  });

  test("a V2 domain mismatch is found through the entry wrapper", () => {
    const def = {
      query: v2Join("innerJoin", [
        column("a", [axis("pl7.app/vdj/clonotypeKey", { chain: "IGH" })], 100),
        column("b", [axis("pl7.app/vdj/clonotypeKey", { chain: "IGK" })], 200),
      ]),
    };
    expect(findings(def, "PTableDefV2").map((f) => f.rule)).toContain("axis-domain-mismatch");
  });

  test("a healthy V2 outer join yields nothing", () => {
    const def = {
      query: {
        type: "outerJoin",
        primary: { entry: column("a", [axis("s"), axis("c")], 1000) },
        secondary: [{ entry: column("b", [axis("c")], 50) }],
      },
    };
    expect(findings(def, "PTableDefV2")).toEqual([]);
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

function findings(def: unknown, kind: "PTableDef" | "PTableDefV2") {
  return structuralFindings(digestDef(kind, def).def);
}

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
