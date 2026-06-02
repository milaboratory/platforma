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
  // Not ready → undefined, and crucially no throw (toBeUndefined fails on a throw).
  // That is the MILAB-6318 fix.
  const acc = accessorWithCtx({
    getIsReadyOrError: () => false,
    getError: () => undefined,
    getDataAsString: () => undefined,
  });
  expect(acc.getDataAsJsonOrUndefined()).toBeUndefined();
});

test("getDataAsJsonOrUndefined parses content once the resource is ready", () => {
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getError: () => undefined,
    getDataAsString: () => JSON.stringify({ min_len: 7 }),
  });
  expect(acc.getDataAsJsonOrUndefined<{ min_len: number }>()).toEqual({ min_len: 7 });
});

test("getDataAsJsonOrUndefined throws the decoded error message when the resource errored", () => {
  const errorLike = JSON.stringify({
    type: "StandardError",
    name: "Error",
    message: "upstream blew up",
  });
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getError: () => ERROR_HANDLE,
    getDataAsString: (handle: AccessorHandle) => (handle === ERROR_HANDLE ? errorLike : undefined),
  });
  // Anchored: asserts the *decoded* message, not the serialized ErrorLike JSON.
  expect(() => acc.getDataAsJsonOrUndefined()).toThrow(/^upstream blew up$/);
});

test("getDataAsJsonOrUndefined falls back to the raw error content when it is not a serialized ErrorLike", () => {
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getError: () => ERROR_HANDLE,
    getDataAsString: (handle: AccessorHandle) => (handle === ERROR_HANDLE ? "not json" : undefined),
  });
  expect(() => acc.getDataAsJsonOrUndefined()).toThrow(/^not json$/);
});

test("getDataAsJsonOrUndefined throws a generic message when the errored node has no content", () => {
  // Errored, but the error node itself has nothing readable — generic fallback.
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getError: () => ERROR_HANDLE,
    getDataAsString: () => undefined,
  });
  expect(() => acc.getDataAsJsonOrUndefined()).toThrow(/^Resource computation failed\.$/);
});

test("getDataAsJsonOrUndefined throws when a ready resource has no error and no content", () => {
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getError: () => undefined,
    getDataAsString: () => undefined,
  });
  expect(() => acc.getDataAsJsonOrUndefined()).toThrow("Resource has no content.");
});
