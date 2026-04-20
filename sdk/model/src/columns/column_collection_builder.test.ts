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

afterEach(async () => {
  for (const driver of drivers) await driver.dispose();
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
    expect(collection.findColumns()).toHaveLength(1);
  });

  test("allowPartialColumnList with complete providers returns collection", () => {
    const snap = createSnapshot("id1", createSpec("col1"));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource(createProvider([snap], true));

    const collection = builder.build({ allowPartialColumnList: true });
    expect(collection).toBeDefined();
    expect(collection.findColumns()).toHaveLength(1);
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

  test("allowPartialColumnList returns collection when any provider incomplete", () => {
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource(createProvider([createSnapshot("id1", createSpec("col1"))], true));
    builder.addSource(createProvider([createSnapshot("id2", createSpec("col2"))], false));

    const collection = builder.build({ allowPartialColumnList: true });
    expect(collection).toBeDefined();
    expect(collection.findColumns()).toHaveLength(2);
  });
});

describe("AnchoredColumnCollection", () => {
  // The anchor spec must also exist as a source column — the new implementation
  // resolves PColumnSpec anchors by matching native ID in the collected columns.
  const anchorSpec = createSpec("anchor-col", {
    axesSpec: [sampleAxis("sample"), sampleAxis("gene")],
  });
  const anchorSnap = createSnapshot("anchor-snap-id", anchorSpec);

  test("build with PColumnSpec anchor returns anchored collection", () => {
    const s1 = createSnapshot("id1", createSpec("col1", { axesSpec: [sampleAxis("sample")] }));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    // anchorSnap must be in sources so resolveAnchorMap can find it by native ID
    builder.addSource([s1, anchorSnap]);

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

  test("getColumn returns snapshot by SUniversalPColumnId", () => {
    const spec = createSpec("col1", { axesSpec: [sampleAxis("sample")] });
    const snap = createSnapshot("id1", spec);
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap, anchorSnap]);

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
    builder.addSource([snap, anchorSnap]);

    const collection = builder.build({ anchors: { main: anchorSpec } })!;
    expect(collection.getColumn("not-a-real-id" as SUniversalPColumnId)).toBeUndefined();
  });

  test("getAnchors returns resolved anchor map", () => {
    const spec = createSpec("col1", { axesSpec: [sampleAxis("sample")] });
    const snap = createSnapshot("id1", spec);
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap, anchorSnap]);

    const collection = builder.build({ anchors: { main: anchorSpec } })!;
    const anchors = collection.getAnchors();
    expect(anchors.size).toBe(1);
    expect(anchors.get("main")).toBeDefined();
    expect(anchors.get("main")!.spec.name).toBe("anchor-col");
  });

  test("findColumns returns ColumnMatch with originalId and variants", () => {
    const spec = createSpec("col1", { axesSpec: [sampleAxis("sample")] });
    const snap = createSnapshot("id1", spec);
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    // anchorSnap itself also appears in findColumns results (axes ⊆ anchor axes)
    builder.addSource([snap, anchorSnap]);

    const collection = builder.build({ anchors: { main: anchorSpec } })!;
    const matches = collection.findColumns();

    // col1 + anchor-col are both discovered
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const col1Match = matches.find((m) => m.column.spec.name === "col1")!;
    expect(col1Match).toBeDefined();
    expect(col1Match.originalId).toBe("id1");
    expect(col1Match.variants).toBeDefined();
  });

  test("variants carry forAnchors keyed by anchor name", () => {
    const spec = createSpec("col1", { axesSpec: [sampleAxis("sample")] });
    const snap = createSnapshot("id1", spec);
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap, anchorSnap]);

    const collection = builder.build({ anchors: { main: anchorSpec } })!;
    const matches = collection.findColumns();
    const col1Match = matches.find((m) => m.column.spec.name === "col1")!;

    expect(col1Match.variants.length).toBeGreaterThan(0);
    for (const v of col1Match.variants) {
      expect(v.qualifications.forAnchors).toBeDefined();
      expect(v.qualifications.forHit).toBeDefined();
      expect(v.distinctiveQualifications.forAnchors).toBeDefined();
      expect(v.distinctiveQualifications.forHit).toBeDefined();
      // forAnchors keys are a subset of anchor names
      for (const key of Object.keys(v.qualifications.forAnchors)) {
        expect(["main"]).toContain(key);
      }
    }
  });

  test("anchors sharing same axes group produce forAnchors entries pointing to same array", () => {
    // Two anchors with identical axesSpec share an axes-group bucket in the reverse index.
    const sharedAxes = [sampleAxis("sample"), sampleAxis("gene")];
    const anchorA = createSpec("anchor-a", { axesSpec: sharedAxes });
    const anchorB = createSpec("anchor-b", { axesSpec: sharedAxes });
    const anchorASnap = createSnapshot("anchor-a-id", anchorA);
    const anchorBSnap = createSnapshot("anchor-b-id", anchorB);

    const colSpec = createSpec("c1", { axesSpec: [sampleAxis("sample")] });
    const colSnap = createSnapshot("c1-id", colSpec);

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([colSnap, anchorASnap, anchorBSnap]);

    const collection = builder.build({ anchors: { a: anchorA, b: anchorB } })!;
    const matches = collection.findColumns();
    const c1 = matches.find((m) => m.column.spec.name === "c1")!;
    expect(c1).toBeDefined();

    for (const v of c1.variants) {
      const forAnchors = v.qualifications.forAnchors;
      if ("a" in forAnchors && "b" in forAnchors) {
        // Shared axes group → same reference for both anchor keys.
        expect(forAnchors.a).toBe(forAnchors.b);
      }
    }
  });

  test("findColumns exclude filters out matching columns", () => {
    const snap1 = createSnapshot("id1", createSpec("col1", { axesSpec: [sampleAxis("sample")] }));
    const snap2 = createSnapshot("id2", createSpec("col2", { axesSpec: [sampleAxis("sample")] }));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([snap1, snap2, anchorSnap]);

    const collection = builder.build({ anchors: { main: anchorSpec } })!;
    const results = collection.findColumns({ exclude: { name: "col1" } });
    expect(results.every((r) => r.column.spec.name !== "col1")).toBe(true);
    expect(results.some((r) => r.column.spec.name === "col2")).toBe(true);
  });

  test("allowPartialColumnList with anchors returns collection when incomplete", () => {
    const snap = createSnapshot("id1", createSpec("col1", { axesSpec: [sampleAxis("sample")] }));
    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource(createProvider([snap, anchorSnap], false));

    const collection = builder.build({
      anchors: { main: anchorSpec },
      allowPartialColumnList: true,
    });
    expect(collection).toBeDefined();
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
    builder.addSource([snap, anchorSnap]);

    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    const idDeriver = new AnchoredIdDeriver({ main: anchorSpec });
    const found = collection.getColumn(idDeriver.deriveS(spec))!;
    expect(found.dataStatus).toBe("computing");
    expect(found.data!.get()).toBeUndefined();
  });
});
