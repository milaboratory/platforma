import { afterEach, expect, test, vi } from "vitest";
import { TreeNodeAccessor } from "./accessor";
import * as internal from "../internal";
import type { AccessorHandle } from "./internal";

const HANDLE = "test-handle" as AccessorHandle;

type RenderCtx = ReturnType<typeof internal.getCfgRenderCtx>;

function accessorWithCtx(ctx: Partial<RenderCtx>): TreeNodeAccessor {
  vi.spyOn(internal, "getCfgRenderCtx").mockReturnValue(ctx as RenderCtx);
  return new TreeNodeAccessor(HANDLE, []);
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("getDataAsJsonOrUndefined returns undefined while the resource is still computing", () => {
  const getDataAsString = vi.fn<() => string | undefined>(() => undefined);
  const acc = accessorWithCtx({ getIsReadyOrError: () => false, getDataAsString });
  expect(acc.getDataAsJsonOrUndefined()).toBeUndefined();
  // Must short-circuit before reading content — that is the MILAB-6318 fix.
  expect(getDataAsString).not.toHaveBeenCalled();
});

test("getDataAsJsonOrUndefined parses content once the resource is ready", () => {
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getDataAsString: () => JSON.stringify({ min_len: 7 }),
  });
  expect(acc.getDataAsJsonOrUndefined<{ min_len: number }>()).toEqual({ min_len: 7 });
});

test("getDataAsJsonOrUndefined throws when a ready resource has no content", () => {
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getDataAsString: () => undefined,
  });
  expect(() => acc.getDataAsJsonOrUndefined()).toThrow("Resource has no content.");
});
