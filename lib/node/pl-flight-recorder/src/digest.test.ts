import { describe, expect, test } from "vitest";
import type { AxisSpec, JoinEntry, PColumn, PColumnSpec } from "@milaboratories/pl-model-common";
import { digestJoinTree, digestPTableDef } from "./digest";

describe("structural findings from specs alone", () => {
  test("identical axes produce no finding", () => {
    const { findings, tree } = digestJoinTree(
      inner([
        column("a", [axis("pl7.app/sampleId")], 100),
        column("b", [axis("pl7.app/sampleId")], 200),
      ]),
    );
    expect(findings).toEqual([]);
    expect(tree.sharedAxes).toEqual(["String|pl7.app/sampleId|"]);
    expect(tree.inputRowsMax).toBe(200);
  });

  test("siblings with no shared axis are a cross join with a row bound", () => {
    const { findings, tree } = digestJoinTree(
      inner([column("a", [axis("s")], 384), column("b", [axis("c")], 2_400_000)]),
    );
    const cross = findings.find((finding) => finding.rule === "cross-join");
    expect(cross?.severity).toBe("critical");
    expect(tree.rowsUpperBound).toBe(384 * 2_400_000);
    expect(tree.sharedAxes).toEqual([]);
  });

  test("same axis under different domains is named as a domain mismatch", () => {
    const { findings } = digestJoinTree(
      inner([
        column("a", [axis("pl7.app/vdj/clonotypeKey", { "pl7.app/vdj/chain": "IGH" })], 100),
        column("b", [axis("pl7.app/vdj/clonotypeKey", { "pl7.app/vdj/chain": "IGK" })], 200),
      ]),
    );
    const mismatch = findings.find((finding) => finding.rule === "axis-domain-mismatch");
    expect(mismatch?.severity).toBe("high");
    expect(mismatch?.domains).toHaveLength(2);
  });

  test("fan-out is reported for an inner join that still has a working key", () => {
    const { findings } = digestJoinTree(
      inner([column("a", [axis("s")], 100), column("b", [axis("s"), axis("c")], 5000)]),
    );
    expect(findings.map((finding) => finding.rule)).toEqual(["partial-key-fan-out"]);
  });

  test("fan-out is not restated on a cartesian node", () => {
    const { findings } = digestJoinTree(
      inner([column("a", [axis("s")], 10), column("b", [axis("c")], 10)]),
    );
    expect(findings.some((finding) => finding.rule === "partial-key-fan-out")).toBe(false);
  });

  test("an outer join's narrower secondary is not a finding", () => {
    const { findings } = digestJoinTree({
      type: "outer",
      primary: column("a", [axis("s"), axis("c")], 1000),
      secondary: [column("b", [axis("c")], 50)],
    } as unknown as JoinEntry<PColumn<unknown>>);
    expect(findings).toEqual([]);
  });

  test("row counts come from parquet chunk stats without reading blobs", () => {
    const { tree } = digestJoinTree(
      inner([column("a", [axis("s")], 1000), column("b", [axis("s")], 3000)]),
    );
    expect(tree.children?.[0].rows).toBe(1000);
    expect(tree.children?.[1].data.partsWithStats).toBe(1);
    expect(tree.rowsKnownForAllInputs).toBe(true);
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
    const { tree } = digestJoinTree(inner([noStats as never, column("b", [axis("s")], 10)]));
    expect(tree.children?.[0].rows).toBeUndefined();
    expect(tree.rowsKnownForAllInputs).toBe(false);
    expect(tree.rowsUpperBound).toBeUndefined();
  });
});

describe("redaction", () => {
  test("no cell value, filter reference or annotation value survives", () => {
    const secret = "CASSLGQGAETQYF";
    const digest = digestPTableDef({
      src: inner([
        {
          type: "inlineColumn",
          column: {
            id: "inline",
            spec: {
              kind: "PColumn",
              name: "x",
              valueType: "String",
              annotations: { "pl7.app/label": secret },
              axesSpec: [axis("s")],
            },
            data: [{ key: [secret], value: secret }],
          },
        } as never,
        column("b", [axis("s")], 10),
      ]),
      partitionFilters: [],
      filters: [
        {
          type: "bySingleColumnV2",
          column: { type: "axis", id: { type: "String", name: "s" } },
          predicate: { operator: "Equal", reference: secret },
        } as never,
      ],
      sorting: [],
    } as never);

    expect(JSON.stringify(digest)).not.toContain(secret);
    expect(digest.filters[0].predicate.reference).toMatchObject({ len: secret.length });
    expect(digest.tree.children?.[0].spec.annotationKeys).toEqual(["pl7.app/label"]);
  });

  test("an InSet filter keeps only its cardinality", () => {
    const digest = digestPTableDef({
      src: inner([column("a", [axis("s")], 1)]),
      partitionFilters: [],
      filters: [
        {
          type: "bySingleColumnV2",
          column: { type: "axis", id: { type: "String", name: "s" } },
          predicate: { operator: "InSet", references: ["a", "b", "c"] },
        } as never,
      ],
      sorting: [],
    } as never);
    expect(digest.filters[0].predicate).toEqual({ operator: "InSet", referenceCount: 3 });
  });
});

// Internals

function inner(entries: unknown[]): JoinEntry<PColumn<unknown>> {
  return { type: "inner", entries } as unknown as JoinEntry<PColumn<unknown>>;
}

function axis(name: string, domain?: Record<string, string>): AxisSpec {
  return { type: "String", name, ...(domain ? { domain } : {}) } as AxisSpec;
}

function column(name: string, axes: AxisSpec[], rows: number): unknown {
  return {
    type: "column",
    column: {
      id: `id-${name}`,
      spec: { kind: "PColumn", name, valueType: "Int", axesSpec: axes } as PColumnSpec,
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
