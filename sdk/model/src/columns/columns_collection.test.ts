import type { AxisSpec, PColumnSpec, PObjectId } from "@milaboratories/pl-model-common";
import { createGlobalPObjectId } from "@milaboratories/pl-model-common";

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ColumnsCollection } from "./columns_collection";
import {
  createTestCollectionDriver,
  type TestCollectionDriverHandle,
} from "./__test_helpers__/collection_driver";

let handle: TestCollectionDriverHandle;

beforeEach(() => {
  handle = createTestCollectionDriver();
});

afterEach(async () => {
  await handle.dispose();
});

const DEFAULT_AXIS: AxisSpec = { name: "id", type: "String" } as AxisSpec;

function gid(name: string): PObjectId {
  return createGlobalPObjectId("test-block", name);
}

function spec(name: string, axesSpec: AxisSpec[] = [DEFAULT_AXIS]): PColumnSpec {
  return { kind: "PColumn", name, valueType: "Int", axesSpec, annotations: {} } as PColumnSpec;
}

function makeCollection(
  cols: ReadonlyArray<{ id: PObjectId; spec: PColumnSpec }>,
  options?: { isFinal?: boolean },
): ColumnsCollection {
  handle.register(cols);
  return ColumnsCollection(
    [
      {
        columns: cols.map((c) => ({ id: c.id, spec: c.spec, data: undefined })) as never,
        isFinal: options?.isFinal ?? true,
      },
    ],
    { driver: handle.driver },
  );
}

describe("ColumnsCollection constructor", () => {
  test("accepts column array source", () => {
    const c = { id: gid("c1"), spec: spec("col1") };
    expect(makeCollection([c]).getColumnIds()).toEqual([c.id]);
  });

  test("merges multiple sources", () => {
    const c1 = { id: gid("c1"), spec: spec("col1") };
    const c2 = { id: gid("c2"), spec: spec("col2") };
    handle.register([c1, c2]);
    const ids = ColumnsCollection(
      [
        { columns: [{ id: c1.id, spec: c1.spec, data: undefined }] as never, isFinal: true },
        { columns: [{ id: c2.id, spec: c2.spec, data: undefined }] as never, isFinal: true },
      ],
      { driver: handle.driver },
    ).getColumnIds();
    expect(ids).toEqual([c1.id, c2.id]);
  });

  test("empty sources array yields empty collection", () => {
    const coll = ColumnsCollection([], { driver: handle.driver });
    expect(coll.getColumnIds()).toEqual([]);
  });
});

describe("ColumnsCollection.isEmpty", () => {
  test("true when no columns", () => {
    expect(ColumnsCollection([], { driver: handle.driver }).isEmpty()).toBe(true);
  });

  test("false when at least one column", () => {
    const c = { id: gid("c1"), spec: spec("col1") };
    expect(makeCollection([c]).isEmpty()).toBe(false);
  });
});

describe("ColumnsCollection.isFinal", () => {
  test("true when all sources final", () => {
    const c = { id: gid("c1"), spec: spec("col1") };
    expect(makeCollection([c], { isFinal: true }).isFinal()).toBe(true);
  });

  test("false when any source incomplete", () => {
    const c = { id: gid("c1"), spec: spec("col1") };
    expect(makeCollection([c], { isFinal: false }).isFinal()).toBe(false);
  });

  test("true with no sources (vacuous)", () => {
    expect(ColumnsCollection([], { driver: handle.driver }).isFinal()).toBe(true);
  });
});

describe("ColumnsCollection.getColumnIds", () => {
  test("deduplicates by id across sources (first wins)", () => {
    const id = gid("c1");
    const c1 = { id, spec: spec("col1") };
    const c2 = { id, spec: spec("col1-dup") };
    handle.register([c1]);
    const ids = ColumnsCollection(
      [
        { columns: [{ id: c1.id, spec: c1.spec, data: undefined }] as never, isFinal: true },
        { columns: [{ id: c2.id, spec: c2.spec, data: undefined }] as never, isFinal: true },
      ],
      { driver: handle.driver },
    ).getColumnIds();
    expect(ids).toEqual([id]);
  });
});

describe("ColumnsCollection.addSource", () => {
  test("returns new instance, original unchanged", () => {
    const c1 = { id: gid("c1"), spec: spec("col1") };
    const c2 = { id: gid("c2"), spec: spec("col2") };
    handle.register([c1, c2]);
    const base = makeCollection([c1]);
    const next = base.addSource({
      columns: [{ id: c2.id, spec: c2.spec, data: undefined } as never],
      isFinal: true,
    });

    expect(next).not.toBe(base);
    expect(base.getColumnIds()).toEqual([c1.id]);
    expect(next.getColumnIds()).toEqual([c1.id, c2.id]);
  });

  test("isFinal reflects appended source", () => {
    const c1 = { id: gid("c1"), spec: spec("col1") };
    const c2 = { id: gid("c2"), spec: spec("col2") };
    handle.register([c1, c2]);
    const base = makeCollection([c1], { isFinal: true });
    expect(base.isFinal()).toBe(true);

    const next = base.addSource({
      columns: [{ id: c2.id, spec: c2.spec, data: undefined } as never],
      isFinal: false,
    });
    expect(next.isFinal()).toBe(false);
  });
});

describe("ColumnsCollection.filter", () => {
  test("returns collection with filtered ids", () => {
    const c1 = { id: gid("c1"), spec: spec("col1") };
    const c2 = { id: gid("c2"), spec: spec("col2") };
    const ids = makeCollection([c1, c2])
      .filter({ exclude: { name: "col1" } })
      .getColumnIds();
    expect(ids).toEqual([c2.id]);
  });

  test("no filters returns all ids", () => {
    const c1 = { id: gid("c1"), spec: spec("col1") };
    const c2 = { id: gid("c2"), spec: spec("col2") };
    const ids = makeCollection([c1, c2]).filter({}).getColumnIds();
    expect(ids).toEqual([c1.id, c2.id]);
  });
});
