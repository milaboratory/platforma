import { describe, expect, test } from "vitest";
import {
  createGlobalPObjectId,
  createLocalPObjectId,
  type AccessorHandle,
} from "@milaboratories/pl-model-common";
import { getCtxProviders } from "./index";
import { DataColumn } from "../data_column";
import { stubRenderCtx } from "../__test_helpers__/stub_render_ctx";

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

//
// Internals
//

/** A ctx whose staging lookup throws, as it does when the staging output field holds an error. */
function ctxWithBrokenStaging() {
  return ctxWithAccessors({
    staging: () => {
      throw new Error("staging output failed");
    },
  });
}

function ctxWithAccessors(accessors: Record<string, () => AccessorHandle | undefined>) {
  const lookups: string[] = [];
  const ctx = stubRenderCtx({
    getAccessorHandleByName: (name) => {
      lookups.push(name);
      return accessors[name]?.();
    },
    getUpstreamBlockCtx: () => [],
  });
  return { ctx, lookups };
}
