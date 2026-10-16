import { afterEach, describe, expect, test } from "vitest";
import { BlockRenderCtx } from "./api";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "cfgRenderCtx");
});

describe("blockId", () => {
  test("is the id the runtime reports", () => {
    Object.assign(globalThis, {
      cfgRenderCtx: { featureFlags: { blockIdSupport: true }, getBlockId: () => "block-1" },
    });

    expect(new BlockRenderCtx().blockId).toBe("block-1");
  });

  test("is undefined on a runtime that does not report it", () => {
    Object.assign(globalThis, {
      cfgRenderCtx: {
        featureFlags: {},
        getBlockId: () => {
          throw new Error("not provided by this runtime");
        },
      },
    });

    expect(new BlockRenderCtx().blockId).toBeUndefined();
  });
});
