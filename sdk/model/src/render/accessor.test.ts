import { afterEach, expect, test, vi } from "vitest";
import { TreeNodeAccessor } from "./accessor";
import * as internal from "../internal";
import type { AccessorHandle } from "./internal";

const HANDLE = "test-handle" as AccessorHandle;
const ERROR_HANDLE = "error-handle" as AccessorHandle;

type RenderCtx = ReturnType<typeof internal.getCfgRenderCtx>;

function accessorWithCtx(ctx: Partial<RenderCtx>, resolvePath: string[] = []): TreeNodeAccessor {
  vi.spyOn(internal, "getCfgRenderCtx").mockReturnValue(ctx as RenderCtx);
  return new TreeNodeAccessor(HANDLE, resolvePath);
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

test("getDataAsJsonOrUndefined throws the error node's message when the resource errored", () => {
  // The backend serializes a resource error as {"message": "..."}; the thrown
  // string is the unwrapped message, not the raw JSON envelope.
  const resourceError = JSON.stringify({ message: "upstream blew up" });
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getError: () => ERROR_HANDLE,
    getDataAsString: (handle: AccessorHandle) =>
      handle === ERROR_HANDLE ? resourceError : undefined,
  });
  expect(() => acc.getDataAsJsonOrUndefined()).toThrow(/^upstream blew up$/);
});

test("getDataAsJsonOrUndefined tags the thrown error with the resolve path", () => {
  // The path identifies which resolve failed when a lambda reads several fields.
  const resourceError = JSON.stringify({ message: "boom" });
  const acc = accessorWithCtx(
    {
      getIsReadyOrError: () => true,
      getError: () => ERROR_HANDLE,
      getDataAsString: (handle: AccessorHandle) =>
        handle === ERROR_HANDLE ? resourceError : undefined,
    },
    ["outputs", "isEmpty"],
  );
  expect(() => acc.getDataAsJsonOrUndefined()).toThrow(/^boom \(at outputs\.isEmpty\)$/);
});

test("getDataAsJsonOrUndefined falls back to the raw content when it is not a message envelope", () => {
  // Plain text (not JSON) → surfaced verbatim.
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getError: () => ERROR_HANDLE,
    getDataAsString: (handle: AccessorHandle) => (handle === ERROR_HANDLE ? "not json" : undefined),
  });
  expect(() => acc.getDataAsJsonOrUndefined()).toThrow(/^not json$/);
});

test("getDataAsJsonOrUndefined falls back to the raw content when JSON has no string message", () => {
  // Valid JSON but not the {message} envelope → surfaced verbatim.
  const raw = JSON.stringify({ code: 42 });
  const acc = accessorWithCtx({
    getIsReadyOrError: () => true,
    getError: () => ERROR_HANDLE,
    getDataAsString: (handle: AccessorHandle) => (handle === ERROR_HANDLE ? raw : undefined),
  });
  expect(() => acc.getDataAsJsonOrUndefined()).toThrow(raw);
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
