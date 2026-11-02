import { describe, expect, test } from "vitest";
import {
  createGlobalPObjectId,
  createLocalPObjectId,
  type AccessorHandle,
} from "@milaboratories/pl-model-common";
import { getCtxProviders } from "./index";
import { ColumnErroredError, DataColumn } from "../data_column";
import { ColumnsCollection } from "../columns_collection";
import { GlobalCfgRenderCtxFeatureFlags } from "../../render/internal";
import { stubRenderCtx } from "../__test_helpers__/stub_render_ctx";
import { createTestCollectionDriver } from "../__test_helpers__/collection_driver";

describe("getCtxProviders by id", () => {
  test("a result-pool id does not look up the block's own outputs", () => {
    const { ctx, lookups } = ctxWithBrokenStaging();

    const providers = getCtxProviders({ ctx, id: createGlobalPObjectId("upstream", "col") });

    expect(providers).toHaveLength(1);
    expect(lookups).toEqual([]);
  });

  test("a staging id looks up staging only", () => {
    const { ctx, lookups } = ctxWithAccessors({});

    getCtxProviders({ ctx, id: createLocalPObjectId(["staging", "out"], "col") });

    expect(lookups).toEqual(["staging"]);
  });

  test("a main id looks up main only", () => {
    const { ctx, lookups } = ctxWithAccessors({});

    getCtxProviders({ ctx, id: createLocalPObjectId(["main", "out"], "col") });

    expect(lookups).toEqual(["main"]);
  });

  test("an id under an unknown root gets the full set", () => {
    const { ctx, lookups } = ctxWithAccessors({});

    getCtxProviders({ ctx, id: createLocalPObjectId(["elsewhere"], "col") });

    expect(lookups).toEqual(["main", "staging"]);
  });

  test("the status of a result-pool id survives a broken staging output", () => {
    const { ctx } = ctxWithBrokenStaging();

    const status = DataColumn.getStatusById(createGlobalPObjectId("upstream", "col"), { ctx });

    expect(status).toBe("absent");
  });
});

describe("an errored block output", () => {
  const STAGING_ERROR = { kind: "source", path: ["staging"], message: "staging output failed" };
  const stagingId = createLocalPObjectId(["staging", "out"], "col");

  test.each([
    ["a host reporting the output's error", ctxWithErroredStaging],
    ["an older host throwing it from the lookup", ctxWithBrokenStaging],
  ])("on %s, the full provider set reports it instead of throwing", (_, makeCtx) => {
    const { ctx } = makeCtx();

    const providers = getCtxProviders({ ctx });

    expect(providers.flatMap((p) => p.getErrors())).toEqual([STAGING_ERROR]);
    expect(providers.flatMap((p) => p.getColumns())).toEqual([]);
  });

  test("the output is not looked up once its error is known", () => {
    const { ctx, lookups } = ctxWithErroredStaging();

    getCtxProviders({ ctx });

    expect(lookups).toEqual(["main"]);
  });

  test("an id under the output reads as errored", () => {
    const { ctx } = ctxWithErroredStaging();

    expect(DataColumn.getStatusById(stagingId, { ctx })).toBe("errored");
    expect(() => DataColumn.fromId(stagingId, { ctx })).toThrow(ColumnErroredError);
  });

  test("a current_block collection reports the output's error", async () => {
    const { ctx } = ctxWithErroredStaging();
    const handle = createTestCollectionDriver();

    const collection = ColumnsCollection(["current_block"], { ctx, driver: handle.driver });

    expect(collection.getColumnIds()).toEqual([]);
    expect(collection.getErrors()).toEqual([STAGING_ERROR]);
    await handle.dispose();
  });
});

//
// Internals
//

const ERROR_HANDLE = "staging-error" as AccessorHandle;

/** A ctx whose host reports the staging output's error resource. */
function ctxWithErroredStaging() {
  const lookups: string[] = [];
  const ctx = stubRenderCtx({
    featureFlags: GlobalCfgRenderCtxFeatureFlags,
    getAccessorHandleByName: (name) => {
      lookups.push(name);
      if (name === "staging") throw new Error("staging output failed");
      return undefined;
    },
    getAccessorErrorByName: (name) => (name === "staging" ? ERROR_HANDLE : undefined),
    getDataAsString: (handle) =>
      handle === ERROR_HANDLE ? JSON.stringify({ message: "staging output failed" }) : undefined,
    getUpstreamBlockCtx: () => [],
  });
  return { ctx, lookups };
}

/**
 * A ctx of an older host: no `getAccessorErrorByName`, and the staging lookup
 * throws, as it does when the staging output field holds an error.
 */
function ctxWithBrokenStaging() {
  return ctxWithAccessors(
    {
      staging: () => {
        throw new Error("staging output failed");
      },
    },
    { olderHost: true },
  );
}

function ctxWithAccessors(
  accessors: Record<string, () => AccessorHandle | undefined>,
  { olderHost = false }: { olderHost?: boolean } = {},
) {
  const lookups: string[] = [];
  const ctx = stubRenderCtx({
    featureFlags: olderHost ? undefined : GlobalCfgRenderCtxFeatureFlags,
    getAccessorHandleByName: (name) => {
      lookups.push(name);
      return accessors[name]?.();
    },
    getAccessorErrorByName: olderHost ? undefined : () => undefined,
    getUpstreamBlockCtx: () => [],
  });
  return { ctx, lookups };
}
