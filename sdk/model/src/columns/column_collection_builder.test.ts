import type {
  AxisSpec,
  PColumnSpec,
  PObjectId,
  SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import { AnchoredIdDeriver } from "@milaboratories/pl-model-common";
import { SpecDriver } from "@milaboratories/pf-spec-driver";

import { afterEach, describe, expect, test } from "vitest";
import type { ColumnSnapshotProvider } from "./column_snapshot_provider";
import type { ColumnSnapshot } from "./column_snapshot";
import { ColumnCollectionBuilder } from "./column_collection_builder";

const drivers: SpecDriver[] = [];

function createSpecFrameCtx() {
  const driver = new SpecDriver();
  drivers.push(driver);
  return driver;
}

afterEach(() => {
  for (const driver of drivers) driver.dispose();
  drivers.length = 0;
});

// --- Helpers ---

/** Default axis used when none specified — WASM requires at least one axis. */
const DEFAULT_AXIS: AxisSpec = { name: "id", type: "String" } as AxisSpec;

function createSpec(
  name: string,
  options?: { domain?: Record<string, string>; axesSpec?: AxisSpec[] },
): PColumnSpec {
  return {
    kind: "PColumn",
    name,
    valueType: "Int",
    axesSpec: options?.axesSpec ?? [DEFAULT_AXIS],
    annotations: {},
    ...(options?.domain !== undefined ? { domain: options.domain } : {}),
  } as PColumnSpec;
}

function createSnapshot(
  id: string,
  spec: PColumnSpec,
  dataStatus: "ready" | "computing" | "absent" = "ready",
): ColumnSnapshot<PObjectId> {
  return {
    id: id as PObjectId,
    spec,
    dataStatus,
    data:
      dataStatus === "absent"
        ? undefined
        : { get: () => (dataStatus === "ready" ? ({} as never) : undefined) },
  };
}

function createProvider(
  snapshots: ColumnSnapshot<PObjectId>[],
  complete = true,
): ColumnSnapshotProvider {
  return {
    getAllColumns() {
      return snapshots;
    },
    isColumnListComplete() {
      return complete;
    },
  };
}

function sampleAxis(name: string, type = "String"): AxisSpec {
  return { name, type } as AxisSpec;
}

// --- Tests ---

describe("ColumnCollectionBuilder", () => {
  test("empty builder returns empty collection", () => {
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    const collection = builder.build();
    expect(collection).toBeDefined();
    expect(collection!.findColumns()).toEqual([]);
  });

  test("addSource returns this for chaining", () => {
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    const result = builder.addSource([]);
    expect(result).toBe(builder);
  });

  test("build returns undefined when providers are incomplete", () => {
    const snap = createSnapshot("id1", createSpec("col1"));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource(createProvider([snap], false));
    expect(builder.build()).toBeUndefined();
  });

  test("build with allowPartialColumnList returns collection even when incomplete", () => {
    const snap = createSnapshot("id1", createSpec("col1"));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource(createProvider([snap], false));

    const collection = builder.build({ allowPartialColumnList: true });
    expect(collection).toBeDefined();
    expect(collection.columnListComplete).toBe(false);
    expect(collection.findColumns()).toHaveLength(1);
  });

  test("allowPartialColumnList with complete providers sets columnListComplete true", () => {
    const snap = createSnapshot("id1", createSpec("col1"));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource(createProvider([snap], true));

    const collection = builder.build({ allowPartialColumnList: true });
    expect(collection.columnListComplete).toBe(true);
  });
});

describe("ColumnCollection.getColumn", () => {
  test("returns snapshot for existing id", () => {
    const spec = createSpec("col1");
    const snap = createSnapshot("id1", spec);
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap]);

    const collection = builder.build()!;
    const found = collection.getColumn("id1" as PObjectId);
    expect(found).toBeDefined();
    expect(found!.spec.name).toBe("col1");
  });

  test("returns undefined for missing id", () => {
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([createSnapshot("id1", createSpec("col1"))]);

    const collection = builder.build()!;
    expect(collection.getColumn("missing" as PObjectId)).toBeUndefined();
  });
});

describe("ColumnCollection.findColumns", () => {
  test("no options returns all columns", () => {
    const s1 = createSnapshot("id1", createSpec("col1"));
    const s2 = createSnapshot("id2", createSpec("col2"));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([s1, s2]);

    const collection = builder.build()!;
    expect(collection.findColumns()).toHaveLength(2);
  });

  test("exclude filters out matching columns", () => {
    const s1 = createSnapshot("id1", createSpec("col1"));
    const s2 = createSnapshot("id2", createSpec("col2"));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([s1, s2]);

    const collection = builder.build()!;
    const results = collection.findColumns({ exclude: { name: "col1" } });
    expect(results).toHaveLength(1);
    expect(results[0].spec.name).toBe("col2");
  });

  test("include filters by exact name among disjoint-axis columns", () => {
    const vdjAxis = sampleAxis("pl7.app/vdj/clonotypeKey");
    const itemAxis = sampleAxis("item");

    const vdjColumns = Array.from({ length: 10 }, (_, i) =>
      createSnapshot(`vdj${i}`, createSpec(`pl7.app/vdj/col${i}`, { axesSpec: [vdjAxis] })),
    );
    const mockScore = createSnapshot("mock", createSpec("mock_score", { axesSpec: [itemAxis] }));

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([...vdjColumns, mockScore]);

    const collection = builder.build()!;
    const results = collection.findColumns({
      include: [{ name: [{ type: "exact", value: "mock_score" }] }],
    });

    expect(results).toHaveLength(1);
    expect(results[0].spec.name).toBe("mock_score");
  });
});

describe("dedup by native ID", () => {
  test("first source wins when specs have same native ID", () => {
    const spec = createSpec("col1");
    const snap1 = createSnapshot("id-first", spec);
    const snap2 = createSnapshot("id-second", spec);

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap1]);
    builder.addSource([snap2]);

    const collection = builder.build()!;
    const all = collection.findColumns();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("id-first");
  });

  test("different specs are not deduped", () => {
    const snap1 = createSnapshot("id1", createSpec("col1"));
    const snap2 = createSnapshot("id2", createSpec("col2"));

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap1]);
    builder.addSource([snap2]);

    const collection = builder.build()!;
    expect(collection.findColumns()).toHaveLength(2);
  });
});

describe("data status handling", () => {
  test("ready column data is accessible", () => {
    const data = { someKey: "someValue" };
    const snap: ColumnSnapshot<PObjectId> = {
      id: "id1" as PObjectId,
      spec: createSpec("col1"),
      dataStatus: "ready",
      data: { get: () => data as never },
    };

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap]);
    const collection = builder.build()!;

    const found = collection.getColumn("id1" as PObjectId)!;
    expect(found.dataStatus).toBe("ready");
    expect(found.data).toBeDefined();
    expect(found.data!.get()).toBe(data);
  });

  test("computing column data returns undefined", () => {
    const snap = createSnapshot("id1", createSpec("col1"), "computing");

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap]);
    const collection = builder.build()!;

    const found = collection.getColumn("id1" as PObjectId)!;
    expect(found.dataStatus).toBe("computing");
    expect(found.data).toBeDefined();

    const result = found.data!.get();
    expect(result).toBeUndefined();
  });

  test("absent column has no data accessor", () => {
    const snap = createSnapshot("id1", createSpec("col1"), "absent");

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap]);
    const collection = builder.build()!;

    const found = collection.getColumn("id1" as PObjectId)!;
    expect(found.dataStatus).toBe("absent");
    expect(found.data).toBeUndefined();
  });
});

describe("multiple providers", () => {
  test("columns from multiple sources are merged", () => {
    const s1 = createSnapshot("id1", createSpec("col1"));
    const s2 = createSnapshot("id2", createSpec("col2"));

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([s1]);
    builder.addSource([s2]);

    const collection = builder.build()!;
    expect(collection.findColumns()).toHaveLength(2);
  });

  test("build returns undefined if any provider is incomplete", () => {
    const s1 = createSnapshot("id1", createSpec("col1"));
    const s2 = createSnapshot("id2", createSpec("col2"));

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource(createProvider([s1], true));
    builder.addSource(createProvider([s2], false));

    expect(builder.build()).toBeUndefined();
  });

  test("allowPartialColumnList is false only when all providers complete", () => {
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource(createProvider([createSnapshot("id1", createSpec("col1"))], true));
    builder.addSource(createProvider([createSnapshot("id2", createSpec("col2"))], false));

    const collection = builder.build({ allowPartialColumnList: true });
    expect(collection.columnListComplete).toBe(false);
  });
});

describe("AnchoredColumnCollection", () => {
  const anchorSpec = createSpec("anchor-col", {
    axesSpec: [sampleAxis("sample"), sampleAxis("gene")],
  });

  test("build with PColumnSpec anchor returns anchored collection", () => {
    const s1 = createSnapshot("id1", createSpec("col1", { axesSpec: [sampleAxis("sample")] }));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([s1]);

    const collection = builder.build({ anchors: { main: anchorSpec } });
    expect(collection).toBeDefined();
  });

  test("build with PObjectId anchor resolves from sources", () => {
    const spec = createSpec("col1", { axesSpec: [sampleAxis("sample")] });
    const snap = createSnapshot("anchor-id", spec);
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap]);

    const collection = builder.build({ anchors: { main: "anchor-id" as PObjectId } });
    expect(collection).toBeDefined();
  });

  test("build with unknown PObjectId anchor throws", () => {
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([createSnapshot("id1", createSpec("col1"))]);

    expect(() => builder.build({ anchors: { main: "missing" as PObjectId } })).toThrow(
      /not found in sources/,
    );
  });

  test("build with PlRef anchor throws", () => {
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    const plRef = { __isRef: true as const, blockId: "b1", name: "out" };

    expect(() => builder.build({ anchors: { main: plRef } })).toThrow(/PlRef/);
  });

  test("getColumn returns snapshot by SUniversalPColumnId", () => {
    const spec = createSpec("col1", { axesSpec: [sampleAxis("sample")] });
    const snap = createSnapshot("id1", spec);
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap]);

    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    const idDeriver = new AnchoredIdDeriver({ main: anchorSpec });
    const expectedId = idDeriver.deriveS(spec);

    const found = collection.getColumn(expectedId);
    expect(found).toBeDefined();
    expect(found!.spec.name).toBe("col1");
    expect(found!.id).toBe(expectedId);
  });

  test("getColumn returns undefined for unknown id", () => {
    const snap = createSnapshot("id1", createSpec("col1", { axesSpec: [sampleAxis("sample")] }));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap]);

    const collection = builder.build({ anchors: { main: anchorSpec } })!;
    expect(collection.getColumn("not-a-real-id" as SUniversalPColumnId)).toBeUndefined();
  });

  test("findColumns returns ColumnMatch with originalId and variants", () => {
    const spec = createSpec("col1", { axesSpec: [sampleAxis("sample")] });
    const snap = createSnapshot("id1", spec);
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap]);

    const collection = builder.build({ anchors: { main: anchorSpec } })!;
    const matches = collection.findColumns();

    expect(matches).toHaveLength(1);
    expect(matches[0].originalId).toBe("id1");
    expect(matches[0].column.spec.name).toBe("col1");
    expect(matches[0].variants).toBeDefined();
  });

  test("findColumns exclude filters out matching columns", () => {
    const snap1 = createSnapshot("id1", createSpec("col1", { axesSpec: [sampleAxis("sample")] }));
    const snap2 = createSnapshot("id2", createSpec("col2", { axesSpec: [sampleAxis("sample")] }));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap1, snap2]);

    const collection = builder.build({ anchors: { main: anchorSpec } })!;
    const results = collection.findColumns({ exclude: { name: "col1" } });
    expect(results).toHaveLength(1);
    expect(results[0].column.spec.name).toBe("col2");
  });

  test("allowPartialColumnList with anchors tracks completeness", () => {
    const snap = createSnapshot("id1", createSpec("col1", { axesSpec: [sampleAxis("sample")] }));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource(createProvider([snap], false));

    const collection = builder.build({
      anchors: { main: anchorSpec },
      allowPartialColumnList: true,
    });
    expect(collection).toBeDefined();
    expect(collection.columnListComplete).toBe(false);
  });

  test("build returns undefined with anchors when incomplete and no allowPartial", () => {
    const snap = createSnapshot("id1", createSpec("col1", { axesSpec: [sampleAxis("sample")] }));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource(createProvider([snap], false));

    const result = builder.build({ anchors: { main: anchorSpec } });
    expect(result).toBeUndefined();
  });

  test("data status is preserved through anchored snapshots", () => {
    const spec = createSpec("computing-col", { axesSpec: [sampleAxis("sample")] });
    const snap = createSnapshot("id1", spec, "computing");

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap]);

    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    const idDeriver = new AnchoredIdDeriver({ main: anchorSpec });
    const found = collection.getColumn(idDeriver.deriveS(spec))!;
    expect(found.dataStatus).toBe("computing");
    expect(found.data!.get()).toBeUndefined();
  });
});
