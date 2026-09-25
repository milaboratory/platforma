import type {
  CollectionHandle,
  ColumnUniversalId,
  ColumnsCollectionDriverModel,
  PColumnSpec,
  PObjectId,
  SerializedColumnsSource,
} from "@milaboratories/pl-model-common";
import { ResourceTypeName, createGlobalPObjectId } from "@milaboratories/pl-model-common";
import { afterEach, describe, expect, test } from "vitest";
import { ColumnsCollection } from "../columns_collection";
import type { GlobalCfgRenderCtx } from "../../render/internal";
import { getCtxProviders } from "./index";

const POOL_BLOCK_ID = "upstream-block";
const POOL_COLUMN_NAME = "poolCol";
const MAIN_COLUMN_NAME = "mainCol";

const SPEC: PColumnSpec = {
  kind: "PColumn",
  name: "test",
  valueType: "Int",
  axesSpec: [{ name: "id", type: "String" }],
  annotations: {},
} as PColumnSpec;

type StubNode = {
  readonly typeName: string;
  readonly fields?: Readonly<Record<string, string>>;
  readonly error?: string;
  readonly data?: string;
};

/** Staging source behaviour under test. */
type StagingMode = "ok" | "errored" | "throws";

/**
 * Build a `GlobalCfgRenderCtx` stub over a flat `handle -> node` map. Covers
 * only the host calls `getCtxProviders` and `DataColumnRecipe.fromId` make.
 */
function makeCtx(suffix: string, stagingMode: StagingMode) {
  const h = (name: string) => `${name}-${suffix}`;

  const pframe = (columnName: string): StubNode => ({
    typeName: ResourceTypeName.PFrame,
    fields: {
      [`${columnName}.spec`]: h(`${columnName}.spec`),
      [`${columnName}.data`]: h(`${columnName}.data`),
    },
  });

  const nodes: Record<string, StubNode> = {
    [h("main")]: pframe(MAIN_COLUMN_NAME),
    [h(`${MAIN_COLUMN_NAME}.spec`)]: { typeName: "json", data: JSON.stringify(SPEC) },
    [h(`${MAIN_COLUMN_NAME}.data`)]: { typeName: "json", data: "{}" },
    [h("pool")]: pframe(POOL_COLUMN_NAME),
    [h(`${POOL_COLUMN_NAME}.spec`)]: { typeName: "json", data: JSON.stringify(SPEC) },
    [h(`${POOL_COLUMN_NAME}.data`)]: { typeName: "json", data: "{}" },
    [h("staging")]:
      stagingMode === "errored"
        ? { typeName: ResourceTypeName.StdMap, error: h("staging.error") }
        : pframe("stagingCol"),
    [h("staging.error")]: { typeName: "json", data: JSON.stringify({ message: "OOM" }) },
    [h("stagingCol.spec")]: { typeName: "json", data: JSON.stringify(SPEC) },
    [h("stagingCol.data")]: { typeName: "json", data: "{}" },
  };

  const node = (handle: string): StubNode => {
    const found = nodes[handle];
    if (found === undefined) throw new Error(`no stub node for handle ${handle}`);
    return found;
  };

  return {
    getAccessorHandleByName: (name: string) => {
      if (name === "main") return h("main");
      if (name === "staging") {
        // The host throws here when the block output field carries an error.
        if (stagingMode === "throws") throw new Error("has input errors: OOM");
        return h("staging");
      }
      return undefined;
    },
    getUpstreamBlockCtx: () => [
      { blockId: POOL_BLOCK_ID, prodCtx: h("pool"), stagingCtx: undefined },
    ],
    getResourceType: (handle: string) => ({ name: node(handle).typeName, version: "1" }),
    listInputFields: (handle: string) => Object.keys(node(handle).fields ?? {}),
    getInputsLocked: () => true,
    getError: (handle: string) => node(handle).error,
    resolveWithCommon: (handle: string, _common: unknown, ...steps: unknown[]) => {
      let current = handle;
      for (const step of steps) {
        const field = typeof step === "string" ? step : (step as { field: string }).field;
        const next = node(current).fields?.[field];
        if (next === undefined) return undefined;
        current = next;
      }
      return current;
    },
    hasData: (handle: string) => node(handle).data !== undefined,
    getDataAsString: (handle: string) => node(handle).data,
  } as unknown as GlobalCfgRenderCtx;
}

function installCtx(ctx: GlobalCfgRenderCtx): void {
  (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
}

afterEach(() => {
  delete (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx;
});

function poolId(): PObjectId {
  return createGlobalPObjectId(POOL_BLOCK_ID, POOL_COLUMN_NAME);
}

/**
 * Driver stub serving one result-pool column id. Records the serialized
 * sources it was created with, so tests can assert which ctx accessors
 * survived the guard.
 */
function makeDriver(): {
  driver: ColumnsCollectionDriverModel;
  created: SerializedColumnsSource[][];
} {
  const handle = "collection-handle" as CollectionHandle;
  const created: SerializedColumnsSource[][] = [];
  const driver = {
    create: (sources: SerializedColumnsSource[]) => {
      created.push(sources);
      return handle;
    },
    isEmpty: () => false,
    isFinal: () => true,
    getColumns: () => [poolId() as unknown as ColumnUniversalId],
    addSource: () => handle,
    discover: () => handle,
    filter: () => handle,
  } as unknown as ColumnsCollectionDriverModel;
  return { driver, created };
}

describe("getCtxProviders with an errored block output", () => {
  test("keeps main and result pool when staging reports an error", () => {
    const ctx = makeCtx("errored", "errored");
    installCtx(ctx);

    const providers = getCtxProviders({ ctx });

    expect(providers).toHaveLength(2);
    expect(providers[1].getPObjectEntries().has(poolId())).toBe(true);
  });

  test("keeps main and result pool when the staging handle lookup throws", () => {
    const ctx = makeCtx("throws", "throws");
    installCtx(ctx);

    const providers = getCtxProviders({ ctx });

    expect(providers).toHaveLength(2);
    expect(providers[1].getPObjectEntries().has(poolId())).toBe(true);
  });

  test("keeps all three providers when staging is healthy", () => {
    const ctx = makeCtx("ok", "ok");
    installCtx(ctx);

    expect(getCtxProviders({ ctx })).toHaveLength(3);
  });

  test("result_pool collection resolves columns while staging is errored", () => {
    const ctx = makeCtx("collection", "throws");
    installCtx(ctx);

    const columns = ColumnsCollection(["result_pool"], { ctx, driver: makeDriver().driver })
      .filter({})
      .getColumns();

    expect(columns.map((c) => c.id)).toEqual([poolId()]);
  });

  test("current_block collection drops the errored staging accessor", () => {
    const ctx = makeCtx("current-block", "throws");
    installCtx(ctx);
    const { driver, created } = makeDriver();

    ColumnsCollection(["current_block"], { ctx, driver });

    expect(created).toEqual([
      [{ kind: "accessor", accessor: "main-current-block", path: ["main"] }],
    ]);
  });
});
