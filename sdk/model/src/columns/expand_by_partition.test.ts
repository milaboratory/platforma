import {
  Annotation,
  canonicalizeAxisId,
  getAxisId,
  isColumnFilteredKey,
  isColumnOverridedKey,
  parseColumnIdSafety,
  parseColumnOverridedId,
  type AxisSpec,
  type JsonPartitionedDataInfoEntries,
  type PColumnSpec,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import type { PColumnDataUniversal } from "../render/internal";
import type { ColumnLazy } from "./column_lazy";
import { ColumnLazyImpl } from "./column_lazy";
import { expandByPartition } from "./expand_by_partition";

// --- Helpers ---

function createAxis(name: string, type = "String"): AxisSpec {
  return { name, type } as AxisSpec;
}

function createSpec(name: string, axes: AxisSpec[]): PColumnSpec {
  return {
    kind: "PColumn",
    name,
    valueType: "Int",
    axesSpec: axes,
    annotations: {},
  } as PColumnSpec;
}

/** Build a synthetic ColumnLazy whose data is a JsonPartitioned DataInfoEntries. */
function createReadyLazy(
  id: string,
  spec: PColumnSpec,
  partitionKeyLength: number,
  parts: { key: (string | number)[]; value: unknown }[],
): ColumnLazy {
  const dataEntries: JsonPartitionedDataInfoEntries<unknown> = {
    type: "JsonPartitioned",
    partitionKeyLength,
    parts,
  };
  // `data` is typed `PColumnDataUniversal` but `getUniquePartitionKeys`
  // duck-types DataInfoEntries via `isDataInfoEntries`, so the JsonPartitioned
  // payload works at runtime.
  return ColumnLazyImpl.fromColumn({
    id: id as PObjectId,
    spec,
    data: dataEntries as unknown as PColumnDataUniversal,
  });
}

function createComputingLazy(id: string, spec: PColumnSpec): ColumnLazy {
  return ColumnLazyImpl.fromColumn({
    id: id as PObjectId,
    spec,
    data: undefined,
  });
}

interface Trace {
  type: string;
  label: string;
  importance?: number;
}

function extractTrace(recipe: { getSpec(): PColumnSpec }): Trace[] {
  const raw = recipe.getSpec().annotations?.[Annotation.Trace];
  return raw ? (JSON.parse(raw) as Trace[]) : [];
}

// --- Tests ---

describe("expandByPartition", () => {
  test("no split axes returns inputs unchanged", () => {
    const s = createReadyLazy("col1", createSpec("c", [createAxis("a")]), 1, [
      { key: ["x"], value: {} },
    ]);
    const result = expandByPartition([s], []);
    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result![0]).toBe(s); // same reference
  });

  test("single axis split produces K recipes", () => {
    const s = createReadyLazy(
      "col1",
      createSpec("c", [createAxis("sample"), createAxis("gene")]),
      2,
      [
        { key: ["s1", "g1"], value: {} },
        { key: ["s1", "g2"], value: {} },
        { key: ["s2", "g1"], value: {} },
      ],
    );

    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result).toBeDefined();
    // unique values on axis 0: s1, s2 → 2 recipes
    expect(result).toHaveLength(2);

    // split axis removed from axesSpec on each recipe
    for (const recipe of result!) {
      const spec = recipe.getSpec();
      expect(spec.axesSpec).toHaveLength(1);
      expect(spec.axesSpec[0].name).toBe("gene");
    }
  });

  test("multi-axis split produces K1 x K2 recipes", () => {
    const s = createReadyLazy(
      "col1",
      createSpec("c", [createAxis("a"), createAxis("b"), createAxis("value")]),
      2,
      [
        { key: ["a1", "b1"], value: {} },
        { key: ["a1", "b2"], value: {} },
        { key: ["a2", "b1"], value: {} },
      ],
    );

    const result = expandByPartition([s], [{ idx: 0 }, { idx: 1 }]);
    expect(result).toBeDefined();
    // a: a1, a2 (2) × b: b1, b2 (2) = 4
    expect(result).toHaveLength(4);

    // both split axes removed, only "value" remains
    for (const recipe of result!) {
      const spec = recipe.getSpec();
      expect(spec.axesSpec).toHaveLength(1);
      expect(spec.axesSpec[0].name).toBe("value");
    }
  });

  test("trace annotations include split info appended to base trace", () => {
    const s = createReadyLazy(
      "col1",
      createSpec("c", [createAxis("sample"), createAxis("gene")]),
      1,
      [
        { key: ["s1"], value: {} },
        { key: ["s2"], value: {} },
      ],
    );

    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result).toBeDefined();
    expect(result).toHaveLength(2);

    const expectedType = `split:${canonicalizeAxisId(getAxisId(createAxis("sample")))}`;

    const trace0 = extractTrace(result![0]);
    expect(trace0).toEqual([
      {
        type: expectedType,
        label: "s1",
        importance: 1_000_000,
      },
    ]);

    const trace1 = extractTrace(result![1]);
    expect(trace1).toEqual([
      {
        type: expectedType,
        label: "s2",
        importance: 1_000_000,
      },
    ]);
  });

  test("existing trace is preserved and split entry is appended", () => {
    const baseTrace = [{ type: "ingest", label: "Input" }];
    const spec: PColumnSpec = {
      ...createSpec("c", [createAxis("sample"), createAxis("gene")]),
      annotations: {
        [Annotation.Trace]: JSON.stringify(baseTrace),
      },
    };
    const s = createReadyLazy("col1", spec, 1, [{ key: ["s1"], value: {} }]);

    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result).toBeDefined();
    expect(result).toHaveLength(1);

    const trace0 = extractTrace(result![0]);
    expect(trace0[0]).toEqual({ type: "ingest", label: "Input" });
    expect(trace0[1].type).toBe(`split:${canonicalizeAxisId(getAxisId(createAxis("sample")))}`);
    expect(trace0[1].label).toBe("s1");
  });

  test("axisValuesLabels option resolves labels in trace entries", () => {
    const sampleAxis = createAxis("sample");
    const s = createReadyLazy("col1", createSpec("c", [sampleAxis, createAxis("gene")]), 1, [
      { key: ["s1"], value: {} },
      { key: ["s2"], value: {} },
    ]);

    const labels: Record<string | number, string> = {
      s1: "Sample One",
      s2: "Sample Two",
    };

    const result = expandByPartition([s], [{ idx: 0 }], {
      axisValuesLabels: () => labels,
    });

    expect(result).toBeDefined();
    expect(extractTrace(result![0])[0].label).toBe("Sample One");
    expect(extractTrace(result![1])[0].label).toBe("Sample Two");
  });

  test("computing input (data undefined) returns undefined", () => {
    const s = createComputingLazy("col1", createSpec("c", [createAxis("a")]));
    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result).toBeUndefined();
  });

  test("empty unique keys for an axis produces no recipes for that column", () => {
    const s = createReadyLazy(
      "col1",
      createSpec("c", [createAxis("a"), createAxis("b")]),
      2,
      [], // no parts → no unique keys
    );

    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result).toBeDefined();
    expect(result).toHaveLength(0);
  });

  test("recipe ids are canonical Overrided<Filtered<inner>>", () => {
    const s = createReadyLazy(
      "col1",
      createSpec("c", [createAxis("sample"), createAxis("gene")]),
      1,
      [
        { key: ["s1"], value: {} },
        { key: ["s2"], value: {} },
      ],
    );

    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result).toBeDefined();
    expect(result).toHaveLength(2);

    for (const recipe of result!) {
      // Outer wrap is Overrided
      const overridedKey = parseColumnOverridedId(recipe.id);
      expect(isColumnOverridedKey(overridedKey)).toBe(true);
      // Inner is a stringified Filtered id
      expect(typeof overridedKey.source).toBe("string");
      const innerParsed = parseColumnIdSafety(overridedKey.source);
      expect(isColumnFilteredKey(innerParsed)).toBe(true);
    }

    // Each recipe's id is distinct
    const ids = new Set(result!.map((r) => r.id));
    expect(ids.size).toBe(2);
  });

  test("domain override carries axis name → value", () => {
    const s = createReadyLazy(
      "col1",
      createSpec("c", [createAxis("sample"), createAxis("gene")]),
      1,
      [
        { key: ["s1"], value: {} },
        { key: ["s2"], value: {} },
      ],
    );

    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result).toBeDefined();
    expect(result).toHaveLength(2);

    const overrided0 = parseColumnOverridedId(result![0].id);
    expect(overrided0.specOverrides.domain).toEqual({ sample: "s1" });

    const overrided1 = parseColumnOverridedId(result![1].id);
    expect(overrided1.specOverrides.domain).toEqual({ sample: "s2" });
  });

  test("multiple input columns are all expanded", () => {
    const s1 = createReadyLazy(
      "col1",
      createSpec("c1", [createAxis("sample"), createAxis("gene")]),
      1,
      [
        { key: ["s1"], value: {} },
        { key: ["s2"], value: {} },
      ],
    );
    const s2 = createReadyLazy(
      "col2",
      createSpec("c2", [createAxis("sample"), createAxis("gene")]),
      1,
      [
        { key: ["x1"], value: {} },
        { key: ["x2"], value: {} },
        { key: ["x3"], value: {} },
      ],
    );

    const result = expandByPartition([s1, s2], [{ idx: 0 }]);
    expect(result).toBeDefined();
    // s1: 2 unique + s2: 3 unique = 5 total
    expect(result).toHaveLength(5);
  });

  test("throws when split axis exceeds partition key length", () => {
    const s = createReadyLazy(
      "col1",
      createSpec("c", [createAxis("a"), createAxis("b"), createAxis("c")]),
      1, // only 1 partition key
      [{ key: ["x"], value: {} }],
    );

    expect(() => expandByPartition([s], [{ idx: 1 }])).toThrow(/Not enough partition keys/);
  });
});
