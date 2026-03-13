import { AnchoredIdDeriver, createPlRef } from "@milaboratories/pl-model-common";
import type { PColumn, PColumnSpec, PlRef } from "@milaboratories/pl-model-common";
import { beforeEach, expect, test, vi } from "vitest";
import { ResultPool } from "./api";

// Prevent getCfgRenderCtx from throwing during ResultPool construction
vi.mock("../internal", () => ({
  getCfgRenderCtx: vi.fn().mockReturnValue({}),
}));

// vi.hoisted ensures mockGetColumns is available inside the vi.mock factory
const { mockGetColumns } = vi.hoisted(() => ({ mockGetColumns: vi.fn() }));

// Mock PColumnCollection so getAnchoredPColumns doesn't need a real render context.
// Must use a regular class (not an arrow function) as the constructor mock.
vi.mock("./util/column_collection", () => ({
  PColumnCollection: class MockPColumnCollection {
    addColumnProvider() {
      return this;
    }
    addAxisLabelProvider() {
      return this;
    }
    getColumns(...args: unknown[]) {
      return mockGetColumns(...args);
    }
  },
}));

beforeEach(() => {
  mockGetColumns.mockReset();
});

function makePartitionedData(keys: string[]) {
  return {
    type: "JsonPartitioned" as const,
    parts: keys.map((k) => ({ key: [k], value: undefined })),
    partitionKeyLength: 1,
  };
}

function makeColumn(data: unknown): PColumn<any> {
  return {
    id: "col-id",
    spec: {
      kind: "PColumn" as const,
      name: "test/name",
      valueType: "String",
      axesSpec: [],
      annotations: {},
    },
    data,
  } as PColumn<any>;
}

class TestResultPool extends ResultPool {
  private readonly mockCols = new Map<string, PColumn<any>>();

  setCol(ref: PlRef, col: PColumn<any>) {
    this.mockCols.set(`${ref.blockId}/${ref.name}`, col);
  }

  override getPColumnByRef(ref: PlRef): any {
    return this.mockCols.get(`${ref.blockId}/${ref.name}`);
  }

  /** Expose private deriveAnchorPartitionKeys for testing */
  deriveKeys(anchors: AnchoredIdDeriver | Record<string, PColumnSpec | PlRef>) {
    return (this as any).deriveAnchorPartitionKeys(anchors);
  }
}

// ─── deriveAnchorPartitionKeys ───────────────────────────────────────────────

test("deriveAnchorPartitionKeys: returns [] for AnchoredIdDeriver input", () => {
  const pool = new TestResultPool();
  expect(pool.deriveKeys(new AnchoredIdDeriver({}))).toEqual([]);
});

test("deriveAnchorPartitionKeys: returns undefined when anchor column is not found", () => {
  const pool = new TestResultPool();
  const ref = createPlRef("block-1", "missing");
  // No column registered — getPColumnByRef returns undefined
  expect(pool.deriveKeys({ main: ref })).toBeUndefined();
});

test("deriveAnchorPartitionKeys: returns undefined when anchor column has no data", () => {
  const pool = new TestResultPool();
  const ref = createPlRef("block-1", "anchor");
  pool.setCol(ref, makeColumn(undefined));
  expect(pool.deriveKeys({ main: ref })).toBeUndefined();
});

test("deriveAnchorPartitionKeys: returns partition keys from a PlRef anchor", () => {
  const pool = new TestResultPool();
  const ref = createPlRef("block-1", "anchor");
  pool.setCol(ref, makeColumn(makePartitionedData(["sample-A", "sample-B"])));
  expect(pool.deriveKeys({ main: ref })).toEqual(["sample-A", "sample-B"]);
});

test("deriveAnchorPartitionKeys: deduplicates and merges keys from multiple PlRef anchors", () => {
  const pool = new TestResultPool();
  const ref1 = createPlRef("block-1", "anchor1");
  const ref2 = createPlRef("block-1", "anchor2");
  pool.setCol(ref1, makeColumn(makePartitionedData(["s1", "s2"])));
  pool.setCol(ref2, makeColumn(makePartitionedData(["s2", "s3"])));

  const keys = pool.deriveKeys({ a: ref1, b: ref2 });
  expect(keys).toHaveLength(3);
  expect(keys).toEqual(expect.arrayContaining(["s1", "s2", "s3"]));
});

test("deriveAnchorPartitionKeys: skips PColumnSpec values (not PlRef)", () => {
  const pool = new TestResultPool();
  const spec: PColumnSpec = {
    kind: "PColumn",
    name: "test/spec",
    valueType: "Int",
    axesSpec: [],
    annotations: {},
  };
  expect(pool.deriveKeys({ main: spec })).toEqual([]);
});

// ─── getAnchoredPColumns filterToAnchorPartitions ────────────────────────────

test("getAnchoredPColumns: injects pl7.app/axisKeys/0 annotation when filterToAnchorPartitions is true", () => {
  const pool = new TestResultPool();
  const ref = createPlRef("block-1", "anchor");
  pool.setCol(ref, makeColumn(makePartitionedData(["s1", "s2"])));

  mockGetColumns.mockReturnValue([makeColumn(makePartitionedData([]))]);
  vi.spyOn(pool, "resolveAnchorCtx").mockReturnValue(new AnchoredIdDeriver({}) as any);

  const result = pool.getAnchoredPColumns(
    { main: ref },
    [{ axes: [{ anchor: "main", idx: 0 }] }],
    { filterToAnchorPartitions: true },
  );

  expect(result).toHaveLength(1);
  expect(result![0].spec.annotations["pl7.app/axisKeys/0"]).toBe(
    JSON.stringify(["s1", "s2"]),
  );
});

test("getAnchoredPColumns: returns undefined when anchor data is not ready", () => {
  const pool = new TestResultPool();
  const ref = createPlRef("block-1", "anchor");
  pool.setCol(ref, makeColumn(undefined)); // data not ready

  mockGetColumns.mockReturnValue([makeColumn(makePartitionedData([]))]);
  vi.spyOn(pool, "resolveAnchorCtx").mockReturnValue(new AnchoredIdDeriver({}) as any);

  const result = pool.getAnchoredPColumns(
    { main: ref },
    [{ axes: [{ anchor: "main", idx: 0 }] }],
    { filterToAnchorPartitions: true },
  );

  expect(result).toBeUndefined();
});

test("getAnchoredPColumns: does not inject annotation when filterToAnchorPartitions is absent", () => {
  const pool = new TestResultPool();
  const ref = createPlRef("block-1", "anchor");
  pool.setCol(ref, makeColumn(makePartitionedData(["s1"])));

  mockGetColumns.mockReturnValue([makeColumn(makePartitionedData([]))]);
  vi.spyOn(pool, "resolveAnchorCtx").mockReturnValue(new AnchoredIdDeriver({}) as any);

  const result = pool.getAnchoredPColumns(
    { main: ref },
    [{ axes: [{ anchor: "main", idx: 0 }] }],
  );

  expect(result).toHaveLength(1);
  expect(result![0].spec.annotations?.["pl7.app/axisKeys/0"]).toBeUndefined();
});
