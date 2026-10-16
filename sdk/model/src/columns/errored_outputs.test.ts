import { afterEach, describe, expect, test } from "vitest";
import {
  createGlobalPObjectId,
  createLocalPObjectId,
  type CollectionHandle,
  type ColumnUniversalId,
  type ColumnsCollectionDriverModel,
  type SerializedColumnsSource,
} from "@milaboratories/pl-model-common";
import { getCtxProviders } from "./column_providers";
import { ColumnsCollection } from "./columns_collection";
import { DataColumn } from "./data_column";
import {
  fakePFrame,
  fakeRenderCtx,
  type FakeRenderCtxOptions,
} from "./__test_helpers__/fake_render_ctx";

afterEach(() => {
  delete (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx;
});

const HOSTS = [
  ["a current host", false],
  ["an older host", true],
] as const;

describe.each(HOSTS)("an errored staging output, on %s", (_, olderHost) => {
  test("keeps main and the result pool, and reports the output's error", () => {
    const { ctx } = installCtx({ ...healthyMainAndPool(), staging: { error: "OOM" }, olderHost });

    const providers = getCtxProviders({ ctx });

    expect(providers.flatMap((p) => p.getColumns()).map((c) => c.id)).toEqual([MAIN_ID, POOL_ID]);
    expect(providers.flatMap((p) => p.getErrors())).toEqual([
      { kind: "source", path: ["staging"], message: "OOM" },
    ]);
  });

  test("a result-pool collection still reads its columns", () => {
    const { ctx } = installCtx({ ...healthyMainAndPool(), staging: { error: "OOM" }, olderHost });
    const { driver } = recordingDriver([POOL_ID]);

    const columns = ColumnsCollection(["result_pool"], { ctx, driver }).getColumns();

    expect(columns.map((c) => c.id)).toEqual([POOL_ID]);
  });
});

describe("an errored staging output in a current_block collection", () => {
  test("becomes an errors source on a current host", () => {
    const { ctx } = installCtx({ ...healthyMainAndPool(), staging: { error: "OOM" } });
    const { driver, created } = recordingDriver([]);

    ColumnsCollection(["current_block"], { ctx, driver });

    expect(created).toEqual([
      [
        { kind: "accessor", accessor: expect.any(String), path: ["main"] },
        { kind: "errors", errors: [{ kind: "source", path: ["staging"], message: "OOM" }] },
      ],
    ]);
  });

  test("is left out on an older host, whose driver cannot read an errors source", () => {
    const { ctx } = installCtx({
      ...healthyMainAndPool(),
      staging: { error: "OOM" },
      olderHost: true,
    });
    const { driver, created } = recordingDriver([]);

    ColumnsCollection(["current_block"], { ctx, driver });

    expect(created).toEqual([[{ kind: "accessor", accessor: expect.any(String), path: ["main"] }]]);
  });
});

describe("a staging output whose resource carries an error", () => {
  test("keeps its healthy columns and reports the resource's error", () => {
    const staging = fakePFrame({ ok: {}, broken: { data: { error: "OOM" } } }, { error: "OOM" });
    const { ctx } = installCtx({ ...healthyMainAndPool(), staging: { value: staging } });

    const providers = getCtxProviders({ ctx });

    expect(providers.flatMap((p) => p.getColumns()).map((c) => c.id)).toEqual([
      MAIN_ID,
      createLocalPObjectId(["staging"], "ok"),
      createLocalPObjectId(["staging"], "broken"),
      POOL_ID,
    ]);
    expect(providers.flatMap((p) => p.getErrors())).toEqual([
      { kind: "source", path: ["staging"], message: "OOM" },
      {
        kind: "column",
        id: createLocalPObjectId(["staging"], "broken"),
        field: "data",
        message: "OOM",
      },
    ]);
  });
});

describe("a healthy staging output", () => {
  test("gives all three providers and no errors", () => {
    const { ctx } = installCtx({
      ...healthyMainAndPool(),
      staging: { value: fakePFrame({ col: {} }) },
    });

    const providers = getCtxProviders({ ctx });

    expect(providers).toHaveLength(3);
    expect(providers.flatMap((p) => p.getErrors())).toEqual([]);
  });
});

describe("an errored data field", () => {
  test.each(HOSTS)("reads as errored on %s", (_, olderHost) => {
    const main = fakePFrame({ col: { data: { error: "OOM" } } });
    const { ctx } = installCtx({ main: { value: main }, olderHost });

    const column = DataColumn.fromId(MAIN_ID, { ctx });

    expect(column?.getDataStatus()).toBe("errored");
    expect(column?.getData()).toBeUndefined();
  });
});

//
// Internals
//

const MAIN_ID = createLocalPObjectId(["main"], "col");
const POOL_ID = createGlobalPObjectId("upstream", "poolCol");

function healthyMainAndPool(): FakeRenderCtxOptions {
  return {
    main: { value: fakePFrame({ col: {} }) },
    pool: [{ blockId: "upstream", prod: fakePFrame({ poolCol: {} }) }],
  };
}

/** Build a fake ctx and install it as the ambient one, as `TreeNodeAccessor` reads it from there. */
function installCtx(options: FakeRenderCtxOptions) {
  const fake = fakeRenderCtx(options);
  (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = fake.ctx;
  return fake;
}

/** A driver whose collections list `ids`, recording the sources each was created from. */
function recordingDriver(ids: ColumnUniversalId[]) {
  const handle = "collection" as CollectionHandle;
  const created: SerializedColumnsSource[][] = [];
  const driver: ColumnsCollectionDriverModel = {
    create: (sources) => {
      created.push([...sources]);
      return handle;
    },
    isEmpty: () => ids.length === 0,
    isFinal: () => true,
    getColumns: () => ids,
    addSource: () => handle,
    discover: () => handle,
    filter: () => handle,
  };
  return { driver, created };
}
