import { describe, expect, test } from "vitest";
import { digestDef } from "./digest";
import { isHashedString, redact } from "./redact";

const SECRET = "CASSLGQGAETQYF";

describe("redaction", () => {
  test("no cell value, filter reference or annotation value survives", () => {
    const digest = digestDef("PTableDef", {
      src: {
        type: "inner",
        entries: [
          {
            type: "inlineColumn",
            column: {
              id: "inline",
              spec: {
                kind: "PColumn",
                name: "x",
                valueType: "String",
                annotations: { "pl7.app/label": SECRET },
                axesSpec: [{ type: "String", name: "s" }],
              },
              data: [{ key: [SECRET], value: SECRET }],
            },
          },
        ],
      },
      partitionFilters: [],
      filters: [
        {
          type: "bySingleColumnV2",
          column: { type: "axis", id: { type: "String", name: "s" } },
          predicate: { operator: "Equal", reference: SECRET },
        },
      ],
      sorting: [],
    });
    expect(JSON.stringify(digest)).not.toContain(SECRET);
  });

  test("schema survives verbatim so a report stays readable", () => {
    const { value } = redact({
      spec: {
        kind: "PColumn",
        name: "pl7.app/vdj/readCount",
        valueType: "Long",
        domain: { "pl7.app/vdj/chain": "IGH" },
        axesSpec: [{ type: "String", name: "pl7.app/sampleId" }],
      },
    });
    const spec = (value as { spec: Record<string, unknown> }).spec;
    expect(spec.name).toBe("pl7.app/vdj/readCount");
    expect(spec.valueType).toBe("Long");
    // Domain values carry join identity, so they are kept at any depth.
    expect(spec.domain).toEqual({ "pl7.app/vdj/chain": "IGH" });
  });

  test("annotation keys are kept and their values hashed", () => {
    const { value } = redact({ annotations: { "pl7.app/label": SECRET } });
    const annotations = (value as { annotations: Record<string, unknown> }).annotations;
    expect(Object.keys(annotations)).toEqual(["pl7.app/label"]);
    expect(isHashedString(annotations["pl7.app/label"])).toBe(true);
    expect(annotations["pl7.app/label"]).toMatchObject({ n: SECRET.length });
  });

  test("the same value hashes the same way, so two labels can be compared", () => {
    const a = redact({ note: SECRET }).value as { note: { h: string } };
    const b = redact({ note: SECRET }).value as { note: { h: string } };
    const c = redact({ note: `${SECRET}x` }).value as { note: { h: string } };
    expect(a.note.h).toBe(b.note.h);
    expect(a.note.h).not.toBe(c.note.h);
  });

  test("a class instance is named, not walked", () => {
    class TreeAccessor {
      constructor(public readonly secret = SECRET) {}
    }
    const { value, stats } = redact({ data: { type: "x" }, accessor: new TreeAccessor() });
    expect(JSON.stringify(value)).not.toContain(SECRET);
    expect((value as { accessor: unknown }).accessor).toEqual({ $opaque: "TreeAccessor" });
    expect(stats.opaqueObjects).toBe(1);
  });

  test("a cycle is marked instead of hanging", () => {
    const node: Record<string, unknown> = { type: "column" };
    node.self = node;
    const { value } = redact(node);
    expect((value as { self: unknown }).self).toEqual({ $cycle: true });
  });

  test("a long array keeps its head, stays an array, and records the loss", () => {
    const { value, stats } = redact(
      { entries: Array.from({ length: 200 }, (_, i) => ({ i })) },
      {
        maxArrayItems: 8,
      },
    );
    const entries = (value as { entries: unknown[] }).entries;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(9);
    expect(entries.at(-1)).toEqual({ $omitted: 192 });
    expect(stats.omittedItems).toBe(192);
  });

  test("a column payload is replaced by counts and never descended into", () => {
    const digest = digestDef("PTableDef", {
      src: {
        type: "column",
        column: {
          id: "c",
          spec: { kind: "PColumn", name: "c", valueType: "Int", axesSpec: [] },
          data: {
            type: "ParquetPartitioned",
            partitionKeyLength: 1,
            parts: {
              [`["${SECRET}"]`]: { data: SECRET, stats: { numberOfRows: 7, size: { column: 3 } } },
            },
          },
        },
      },
      partitionFilters: [],
      filters: [],
      sorting: [],
    });
    expect(JSON.stringify(digest)).not.toContain(SECRET);
    const data = (digest.def as { src: { column: { data: Record<string, unknown> } } }).src.column
      .data;
    expect(data).toMatchObject({ kind: "ParquetPartitioned", parts: 1, rows: 7 });
  });

  test("an inline payload is reduced to a count and a sampled size", () => {
    const values = Array.from({ length: 1000 }, (_, i) => ({ key: [`k${i}`], value: SECRET }));
    const { value } = redact({ data: values });
    const data = (value as { data: Record<string, unknown> }).data;
    expect(JSON.stringify(data)).not.toContain(SECRET);
    expect(data.kind).toBe("inline");
    expect(data.entries).toBe(1000);
    expect(data.approxBytes as number).toBeGreaterThan(0);
  });

  test("a deep definition is cut rather than followed forever", () => {
    let node: Record<string, unknown> = { type: "leaf" };
    for (let i = 0; i < 50; i++) node = { type: "wrap", input: node };
    const { value, stats } = redact(node, { maxDepth: 6 });
    expect(stats.depthCapped).toBeGreaterThan(0);
    expect(JSON.stringify(value)).toContain("$depth");
  });

  test("the node budget bounds one record", () => {
    const wide = { entries: Array.from({ length: 500 }, (_, i) => ({ type: "column", i })) };
    const { stats } = redact(wide, { maxNodes: 50, maxArrayItems: 500 });
    expect(stats.budgetExhausted).toBe(true);
  });
});
