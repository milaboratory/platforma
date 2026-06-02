import { afterEach, expect, test, vi } from "vitest";
import { TreeNodeAccessor } from "./accessor";
import * as internal from "../internal";
import type { AccessorHandle } from "./internal";

const HANDLE = "test-handle" as AccessorHandle;
const ERROR_HANDLE = "error-handle" as AccessorHandle;

type RenderCtx = ReturnType<typeof internal.getCfgRenderCtx>;

function accessorWithCtx(ctx: Partial<RenderCtx>): TreeNodeAccessor {
  vi.spyOn(internal, "getCfgRenderCtx").mockReturnValue(ctx as RenderCtx);
  return new TreeNodeAccessor(HANDLE, []);
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("getDataAsJsonOrUndefined returns undefined while the resource is still computing", () => {
  const getError = vi.fn<(handle: AccessorHandle) => AccessorHandle | undefined>(() => undefined);
  const getDataAsString = vi.fn<(handle: AccessorHandle) => string | undefined>(() => undefined);
  const acc = accessorWithCtx({ getIsReadyOrError: () => false, getError, getDataAsString });
  expect(acc.getDataAsJsonOrUndefined()).toBeUndefined();
  // Short-circuits before reading error or content — that is the MILAB-6318 fix.
  expect(getError).not.toHaveBeenCalled();
  expect(getDataAsString).not.toHaveBeenCalled();
});

test("getDataAsJsonOrUndefined parses content once the resource is ready", () => {
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getError: () => undefined,
    getDataAsString: () => JSON.stringify({ min_len: 7 }),
  });
  expect(acc.getDataAsJsonOrUndefined<{ min_len: number }>()).toEqual({ min_len: 7 });
});

test("getDataAsJsonOrUndefined throws the resource error when the resource errored", () => {
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getError: () => ERROR_HANDLE,
    getDataAsString: (handle: AccessorHandle) =>
      handle === ERROR_HANDLE ? "upstream blew up" : undefined,
  });
  expect(() => acc.getDataAsJsonOrUndefined()).toThrow("upstream blew up");
});

test("getDataAsJsonOrUndefined throws when a ready resource has no error and no content", () => {
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getError: () => undefined,
    getDataAsString: () => undefined,
  });
  expect(() => acc.getDataAsJsonOrUndefined()).toThrow("Resource has no content.");
});
