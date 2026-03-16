import type { PColumnSpec, PObjectId } from "@milaboratories/pl-model-common";
import { describe, expect, test, vi } from "vitest";
import type { ColumnProvider } from "./column_provider";
import type { ColumnSnapshot } from "./column_snapshot";
import { ColumnCollectionBuilder } from "./column_collection_builder";

// --- Helpers ---

function createSpec(name: string, domain?: Record<string, string>): PColumnSpec {
  return {
    kind: "PColumn",
    name,
    valueType: "Int",
    axesSpec: [],
    annotations: {},
    ...(domain !== undefined ? { domain } : {}),
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
): ColumnProvider {
  return {
    selectColumns(selectors) {
      const pred = typeof selectors === "function" ? selectors : () => true;
      return snapshots.filter((s) => pred(s.spec));
    },
    getColumn(id) {
      return snapshots.find((s) => s.id === id);
    },
    isColumnListComplete() {
      return complete;
    },
  };
}

// --- Tests ---

describe("ColumnCollectionBuilder", () => {
  test("empty builder returns empty collection", () => {
    const builder = new ColumnCollectionBuilder();
    const collection = builder.build();
    expect(collection).toBeDefined();
    expect(collection!.findColumns()).toEqual([]);
  });

  test("addSource returns this for chaining", () => {
    const builder = new ColumnCollectionBuilder();
    const result = builder.addSource([]);
    expect(result).toBe(builder);
  });

  test("build returns undefined when providers are incomplete", () => {
    const snap = createSnapshot("id1", createSpec("col1"));
    const builder = new ColumnCollectionBuilder();
    builder.addSource(createProvider([snap], false));
    expect(builder.build()).toBeUndefined();
  });

  test("build with allowPartialColumnList returns collection even when incomplete", () => {
    const snap = createSnapshot("id1", createSpec("col1"));
    const builder = new ColumnCollectionBuilder();
    builder.addSource(createProvider([snap], false));

    const collection = builder.build({ allowPartialColumnList: true });
    expect(collection).toBeDefined();
    expect(collection.columnListComplete).toBe(false);
    expect(collection.findColumns()).toHaveLength(1);
  });

  test("allowPartialColumnList with complete providers sets columnListComplete true", () => {
    const snap = createSnapshot("id1", createSpec("col1"));
    const builder = new ColumnCollectionBuilder();
    builder.addSource(createProvider([snap], true));

    const collection = builder.build({ allowPartialColumnList: true });
    expect(collection.columnListComplete).toBe(true);
  });
});

describe("ColumnCollection.getColumn", () => {
  test("returns snapshot for existing id", () => {
    const spec = createSpec("col1");
    const snap = createSnapshot("id1", spec);
    const builder = new ColumnCollectionBuilder();
    builder.addSource([snap]);

    const collection = builder.build()!;
    const found = collection.getColumn("id1" as PObjectId);
    expect(found).toBeDefined();
    expect(found!.spec.name).toBe("col1");
  });

  test("returns undefined for missing id", () => {
    const builder = new ColumnCollectionBuilder();
    builder.addSource([createSnapshot("id1", createSpec("col1"))]);

    const collection = builder.build()!;
    expect(collection.getColumn("missing" as PObjectId)).toBeUndefined();
  });
});

describe("ColumnCollection.findColumns", () => {
  test("no opts returns all columns", () => {
    const s1 = createSnapshot("id1", createSpec("col1"));
    const s2 = createSnapshot("id2", createSpec("col2"));
    const builder = new ColumnCollectionBuilder();
    builder.addSource([s1, s2]);

    const collection = builder.build()!;
    expect(collection.findColumns()).toHaveLength(2);
  });

  test("include filters by selector", () => {
    const s1 = createSnapshot("id1", createSpec("col1"));
    const s2 = createSnapshot("id2", createSpec("col2"));
    const builder = new ColumnCollectionBuilder();
    builder.addSource([s1, s2]);

    const collection = builder.build()!;
    const result = collection.findColumns({ include: { name: "col1" } });
    expect(result).toHaveLength(1);
    expect(result[0].spec.name).toBe("col1");
  });

  test("exclude filters out by selector", () => {
    const s1 = createSnapshot("id1", createSpec("col1"));
    const s2 = createSnapshot("id2", createSpec("col2"));
    const builder = new ColumnCollectionBuilder();
    builder.addSource([s1, s2]);

    const collection = builder.build()!;
    const result = collection.findColumns({ exclude: { name: "col1" } });
    expect(result).toHaveLength(1);
    expect(result[0].spec.name).toBe("col2");
  });

  test("include and exclude combined", () => {
    const s1 = createSnapshot("id1", createSpec("col1", { group: "domA" }));
    const s2 = createSnapshot("id2", createSpec("col2", { group: "domA" }));
    const s3 = createSnapshot("id3", createSpec("col3", { group: "domB" }));
    const builder = new ColumnCollectionBuilder();
    builder.addSource([s1, s2, s3]);

    const collection = builder.build()!;
    const result = collection.findColumns({
      include: { domain: { group: "domA" } },
      exclude: { name: "col1" },
    });
    expect(result).toHaveLength(1);
    expect(result[0].spec.name).toBe("col2");
  });

  test("include with array of selectors", () => {
    const s1 = createSnapshot("id1", createSpec("col1"));
    const s2 = createSnapshot("id2", createSpec("col2"));
    const s3 = createSnapshot("id3", createSpec("col3"));
    const builder = new ColumnCollectionBuilder();
    builder.addSource([s1, s2, s3]);

    const collection = builder.build()!;
    const result = collection.findColumns({
      include: [{ name: "col1" }, { name: "col3" }],
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.spec.name).sort()).toEqual(["col1", "col3"]);
  });
});

describe("dedup by native ID", () => {
  test("first source wins when specs have same native ID", () => {
    // Same spec name+axes → same native ID, different PObjectId
    const spec = createSpec("col1");
    const snap1 = createSnapshot("id-first", spec);
    const snap2 = createSnapshot("id-second", spec);

    const builder = new ColumnCollectionBuilder();
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

    const builder = new ColumnCollectionBuilder();
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

    const builder = new ColumnCollectionBuilder();
    builder.addSource([snap]);
    const collection = builder.build()!;

    const found = collection.getColumn("id1" as PObjectId)!;
    expect(found.dataStatus).toBe("ready");
    expect(found.data).toBeDefined();
    expect(found.data!.get()).toBe(data);
  });

  test("computing column data calls markUnstable", () => {
    const markUnstable = vi.fn();
    const snap = createSnapshot("id1", createSpec("col1"), "computing");

    const builder = new ColumnCollectionBuilder(markUnstable);
    builder.addSource([snap]);
    const collection = builder.build()!;

    const found = collection.getColumn("id1" as PObjectId)!;
    expect(found.dataStatus).toBe("computing");
    expect(found.data).toBeDefined();

    const result = found.data!.get();
    expect(result).toBeUndefined();
    expect(markUnstable).toHaveBeenCalledOnce();
  });

  test("absent column has no data accessor", () => {
    const snap = createSnapshot("id1", createSpec("col1"), "absent");

    const builder = new ColumnCollectionBuilder();
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

    const builder = new ColumnCollectionBuilder();
    builder.addSource([s1]);
    builder.addSource([s2]);

    const collection = builder.build()!;
    expect(collection.findColumns()).toHaveLength(2);
  });

  test("build returns undefined if any provider is incomplete", () => {
    const s1 = createSnapshot("id1", createSpec("col1"));
    const s2 = createSnapshot("id2", createSpec("col2"));

    const builder = new ColumnCollectionBuilder();
    builder.addSource(createProvider([s1], true));
    builder.addSource(createProvider([s2], false));

    expect(builder.build()).toBeUndefined();
  });

  test("allowPartialColumnList is false only when all providers complete", () => {
    const builder = new ColumnCollectionBuilder();
    builder.addSource(createProvider([createSnapshot("id1", createSpec("col1"))], true));
    builder.addSource(createProvider([createSnapshot("id2", createSpec("col2"))], false));

    const collection = builder.build({ allowPartialColumnList: true });
    expect(collection.columnListComplete).toBe(false);
  });
});

describe("anchored build", () => {
  test("throws for anchored build (not yet implemented)", () => {
    const builder = new ColumnCollectionBuilder();
    expect(() =>
      builder.build({ anchors: { main: "id1" as PObjectId } }),
    ).toThrow(/not yet implemented/i);
  });
});
