import type {
  AxisSpec,
  JsonPartitionedDataInfoEntries,
  PColumnSpec,
  PObjectId,
} from "@milaboratories/pl-model-common";
import { canonicalizeAxisId, getAxisId } from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import type { PColumnDataUniversal } from "../render/internal";
import type { ColumnSnapshot } from "./column_snapshot";
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

/** Create a ready snapshot whose data.get() returns a JsonPartitioned DataInfoEntries. */
function createReadySnapshot(
  id: string,
  columnSpec: PColumnSpec,
  partitionKeyLength: number,
  parts: { key: (string | number)[]; value: unknown }[],
): ColumnSnapshot {
  const dataEntries: JsonPartitionedDataInfoEntries<unknown> = {
    type: "JsonPartitioned",
    partitionKeyLength,
    parts,
  };
  return {
    id: id as PObjectId,
    spec: columnSpec,
    dataStatus: "ready",
    // convertOrParsePColumnData checks isDataInfoEntries first (duck-type),
    // so this works at runtime despite the PColumnDataUniversal type
    data: { get: () => dataEntries as unknown as PColumnDataUniversal },
  };
}

function createComputingSnapshot(id: string, columnSpec: PColumnSpec): ColumnSnapshot {
  return {
    id: id as PObjectId,
    spec: columnSpec,
    dataStatus: "computing",
    data: {
      get: () => undefined,
    },
  };
}

function createAbsentSnapshot(id: string, columnSpec: PColumnSpec): ColumnSnapshot {
  return {
    id: id as PObjectId,
    spec: columnSpec,
    dataStatus: "absent",
    data: undefined,
  };
}

interface Trace {
  type: string;
  label: string;
  importance: number;
}

function extractTrace(snapshot: ColumnSnapshot): Trace[] {
  const raw = snapshot.spec.annotations?.["pl7.app/trace"];
  return raw ? (JSON.parse(raw) as Trace[]) : [];
}

// --- Tests ---

describe("expandByPartition", () => {
  test("no split axes returns snapshots as-is", () => {
    const s = createReadySnapshot("col1", createSpec("c", [createAxis("a")]), 1, [
      { key: ["x"], value: {} },
    ]);
    const result = expandByPartition([s], []);
    expect(result.complete).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toBe(s); // same reference
  });

  test("single axis split produces K snapshots", () => {
    const s = createReadySnapshot(
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

    expect(result.complete).toBe(true);
    // unique values on axis 0: s1, s2 → 2 snapshots
    expect(result.items).toHaveLength(2);

    // split axis removed from axesSpec
    for (const snap of result.items) {
      expect(snap.spec.axesSpec).toHaveLength(1);
      expect(snap.spec.axesSpec[0].name).toBe("gene");
    }
  });

  test("multi-axis split produces K1 x K2 snapshots", () => {
    const s = createReadySnapshot(
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

    expect(result.complete).toBe(true);
    // a: a1, a2 (2) × b: b1, b2 (2) = 4
    expect(result.items).toHaveLength(4);

    // both split axes removed, only "value" remains
    for (const snap of result.items) {
      expect(snap.spec.axesSpec).toHaveLength(1);
      expect(snap.spec.axesSpec[0].name).toBe("value");
    }
  });

  test("trace annotations include split info", () => {
    const s = createReadySnapshot(
      "col1",
      createSpec("c", [createAxis("sample"), createAxis("gene")]),
      1,
      [
        { key: ["s1"], value: {} },
        { key: ["s2"], value: {} },
      ],
    );

    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result.complete).toBe(true);
    expect(result.items).toHaveLength(2);

    const trace0 = extractTrace(result.items[0]);
    expect(trace0).toEqual([
      {
        type: `split:${canonicalizeAxisId(getAxisId(createAxis("sample")))}`,
        label: "s1",
        importance: 1_000_000,
      },
    ]);

    const trace1 = extractTrace(result.items[1]);
    expect(trace1).toEqual([
      {
        type: `split:${canonicalizeAxisId(getAxisId(createAxis("sample")))}`,
        label: "s2",
        importance: 1_000_000,
      },
    ]);
  });

  test("axisLabels option resolves labels", () => {
    const sampleAxis = createAxis("sample");
    const s = createReadySnapshot("col1", createSpec("c", [sampleAxis, createAxis("gene")]), 1, [
      { key: ["s1"], value: {} },
      { key: ["s2"], value: {} },
    ]);

    const labels: Record<string | number, string> = {
      s1: "Sample One",
      s2: "Sample Two",
    };

    const result = expandByPartition([s], [{ idx: 0 }], {
      axisLabels: () => labels,
    });

    expect(result.complete).toBe(true);
    const trace0 = extractTrace(result.items[0]);
    expect(trace0[0].label).toBe("Sample One");
    const trace1 = extractTrace(result.items[1]);
    expect(trace1[0].label).toBe("Sample Two");
  });

  test("computing snapshot returns incomplete", () => {
    const s = createComputingSnapshot("col1", createSpec("c", [createAxis("a")]));
    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result.complete).toBe(false);
    expect(result.items).toHaveLength(0);
  });

  test("absent snapshot returns incomplete", () => {
    const s = createAbsentSnapshot("col1", createSpec("c", [createAxis("a")]));
    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result.complete).toBe(false);
    expect(result.items).toHaveLength(0);
  });

  test("empty unique keys for an axis produces no snapshots for that column", () => {
    const s = createReadySnapshot(
      "col1",
      createSpec("c", [createAxis("a"), createAxis("b")]),
      2,
      [], // no parts → no unique keys
    );

    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result.complete).toBe(true);
    expect(result.items).toHaveLength(0);
  });

  test("filtered data is accessible on expanded snapshots", () => {
    const s = createReadySnapshot(
      "col1",
      createSpec("c", [createAxis("sample"), createAxis("gene")]),
      1,
      [
        { key: ["s1"], value: { payload: "data-s1" } },
        { key: ["s2"], value: { payload: "data-s2" } },
      ],
    );

    const result = expandByPartition([s], [{ idx: 0 }]);
    expect(result.complete).toBe(true);
    expect(result.items).toHaveLength(2);

    // Each expanded snapshot should have accessible data
    for (const snap of result.items) {
      expect(snap.data).toBeDefined();
      const data = snap.data!.get();
      expect(data).toBeDefined();
    }
  });

  test("multiple input snapshots are all expanded", () => {
    const s1 = createReadySnapshot(
      "col1",
      createSpec("c1", [createAxis("sample"), createAxis("gene")]),
      1,
      [
        { key: ["s1"], value: {} },
        { key: ["s2"], value: {} },
      ],
    );
    const s2 = createReadySnapshot(
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
    expect(result.complete).toBe(true);
    // s1: 2 unique + s2: 3 unique = 5 total
    expect(result.items).toHaveLength(5);
  });

  test("throws when split axis exceeds partition key length", () => {
    const s = createReadySnapshot(
      "col1",
      createSpec("c", [createAxis("a"), createAxis("b"), createAxis("c")]),
      1, // only 1 partition key
      [{ key: ["x"], value: {} }],
    );

    expect(() => expandByPartition([s], [{ idx: 1 }])).toThrow(/Not enough partition keys/);
  });
});
