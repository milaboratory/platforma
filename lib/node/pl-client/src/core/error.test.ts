import * as tp from "node:timers/promises";
import { isTimeoutOrCancelError, isTransientCallFailure } from "./errors";
import { test, expect } from "vitest";

/** Shapes the predicates match on: an RpcError-like from grpc, a RESTError-like from REST. */
function rpcError(code: string) {
  return { name: "RpcError", code };
}

test("only transport failures count as transient", () => {
  // Worth retrying: the call never reached a verdict.
  expect(isTransientCallFailure(rpcError("UNAVAILABLE"))).toBe(true);
  expect(isTransientCallFailure(rpcError("DEADLINE_EXCEEDED"))).toBe(true);

  // Real answers from the server. Retrying these would hide a genuine failure and,
  // for auth, silently repeat a rejected credential.
  expect(isTransientCallFailure(rpcError("UNAUTHENTICATED"))).toBe(false);
  expect(isTransientCallFailure(rpcError("PERMISSION_DENIED"))).toBe(false);
  expect(isTransientCallFailure(rpcError("NOT_FOUND"))).toBe(false);
  expect(isTransientCallFailure(rpcError("UNIMPLEMENTED"))).toBe(false);

  expect(isTransientCallFailure(undefined)).toBe(false);
  expect(isTransientCallFailure(null)).toBe(false);
  expect(isTransientCallFailure(new Error("plain"))).toBe(false);
});

test("timeout of sleep error type detection", async () => {
  let noError = false;
  try {
    await tp.setTimeout(1000, undefined, { signal: AbortSignal.timeout(10) });
    noError = true;
  } catch (err: unknown) {
    expect((err as any).code).toStrictEqual("ABORT_ERR");
    expect(isTimeoutOrCancelError(err)).toEqual(true);
  }
  expect(noError).toBe(false);
});
