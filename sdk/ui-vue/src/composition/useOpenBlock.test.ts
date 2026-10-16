import type { ResultOrError } from "@platforma-sdk/model";
import { describe, expect, test, vi } from "vitest";
import { hostOpenBlock } from "./useOpenBlock";

describe("hostOpenBlock", () => {
  test("is absent without a host", () => {
    expect(hostOpenBlock(undefined)).toBeUndefined();
  });

  test("is absent on hosts of earlier API versions", () => {
    expect(hostOpenBlock({ apiVersion: undefined })).toBeUndefined();
    expect(hostOpenBlock({ apiVersion: 2 })).toBeUndefined();
  });

  test("is absent on a host that cannot open blocks", () => {
    expect(hostOpenBlock({ apiVersion: 3 })).toBeUndefined();
  });

  test("asks the host to open the block", async () => {
    const openBlock = vi.fn(
      async (_blockId: string): Promise<ResultOrError<void>> => ({ value: undefined }),
    );
    const open = definedOpenBlock(hostOpenBlock({ apiVersion: 3, openBlock }));

    await open("b1");

    expect(openBlock).toHaveBeenCalledWith("b1");
  });

  test("rejects when the host cannot open the block", async () => {
    const open = definedOpenBlock(
      hostOpenBlock({
        apiVersion: 3,
        openBlock: async () => ({ error: new Error("no block b1") }),
      }),
    );

    await expect(open("b1")).rejects.toThrow("no block b1");
  });
});

// Internals

function definedOpenBlock(
  open: undefined | ((blockId: string) => Promise<void>),
): (blockId: string) => Promise<void> {
  if (open === undefined) throw new Error("The host is expected to open blocks");
  return open;
}
