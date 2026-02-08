import type { Status } from "../proto-grpc/github.com/googleapis/googleapis/google/rpc/status";
import { Aborted } from "@milaboratories/ts-helpers";
import { Code } from "../proto-grpc/google/rpc/code";

export function isConnectionProblem(err: unknown, nested: boolean = false): boolean {
  if (err === undefined || err === null) return false;

  if (err instanceof DisconnectedError) return true;
  if ((err as any).name == "RpcError" && (err as any).code == "UNAVAILABLE") return true;
  if ((err as any).name == "RESTError" && (err as any).status.code == Code.UNAVAILABLE) return true;
  if ((err as any).cause !== undefined && !nested)
    return isConnectionProblem((err as any).cause, true);
  return false;
}

export function isUnauthenticated(err: unknown, nested: boolean = false): boolean {
  if (err === undefined || err === null) return false;

  if (err instanceof UnauthenticatedError) return true;
  if ((err as any).name == "RpcError" && (err as any).code == "UNAUTHENTICATED") return true;
  if ((err as any).name == "RESTError" && (err as any).status.code == Code.UNAUTHENTICATED)
    return true;
  if ((err as any).cause !== undefined && !nested)
    return isUnauthenticated((err as any).cause, true);
  return false;
}

export function isTimeoutError(err: unknown, nested: boolean = false): boolean {
  if (err === undefined || err === null) return false;

  if ((err as any).name == "TimeoutError") return true;
  if ((err as any).name == "RpcError" && (err as any).code == "DEADLINE_EXCEEDED") return true;
  if ((err as any).name == "RESTError" && (err as any).status.code == Code.DEADLINE_EXCEEDED)
    return true;
  if ((err as any).cause !== undefined && !nested) return isTimeoutError((err as any).cause, true);
  return false;
}

export function isCancelError(err: unknown, nested: boolean = false): boolean {
  if (err === undefined || err === null) return false;

  if ((err as any).name == "RpcError" && (err as any).code == "CANCELLED") return true;
  if ((err as any).name == "RESTError" && (err as any).status.code == Code.CANCELLED) return true;
  if ((err as any).cause !== undefined && !nested) return isCancelError((err as any).cause, true);
  return false;
}

export function isAbortedError(err: unknown, nested: boolean = false): boolean {
  if (err === undefined || err === null) return false;

  if (err instanceof Aborted || (err as any).name == "AbortError") return true;
  if ((err as any).code == "ABORT_ERR") return true;
  if (err instanceof DOMException && err.code === DOMException.ABORT_ERR) return true; // WebSocket error
  if ((err as any).name == "RpcError" && (err as any).code == "ABORTED") return true;
  if ((err as any).name == "RESTError" && (err as any).status.code == Code.ABORTED) return true;
  if ((err as any).cause !== undefined && !nested) isAbortedError((err as any).cause, true);
  return false;
}

export function isTimeoutOrCancelError(err: unknown, nested: boolean = false): boolean {
  if (err === undefined || err === null) return false;

  if (isAbortedError(err, true)) return true;
  if (isTimeoutError(err, true)) return true;
  if (isCancelError(err, true)) return true;
  if ((err as any).cause !== undefined && !nested)
    return isTimeoutOrCancelError((err as any).cause, true);
  return false;
}

export function isNotFoundError(err: unknown, nested: boolean = false): boolean {
  if (err === undefined || err === null) return false;

  if ((err as any).name == "RpcError" && (err as any).code == "NOT_FOUND") return true;
  if ((err as any).name == "RESTError" && (err as any).status.code == Code.NOT_FOUND) return true;
  if ((err as any).cause !== undefined && !nested) return isNotFoundError((err as any).cause, true);
  return err instanceof RecoverablePlError && err.status.code === PlErrorCodeNotFound;
}

export const PlErrorCodeNotFound: number = Code.NOT_FOUND;

export class PlError extends Error {
  name = "PlError";
  constructor(
    public readonly status: Status,
    opts?: ErrorOptions,
  ) {
    super(`code=${status.code} ${status.message}`, opts);
  }
}

export function throwPlNotFoundError(message: string): never {
  throw new RecoverablePlError({ code: PlErrorCodeNotFound, message, details: [] });
}

export class RecoverablePlError extends PlError {
  name = "RecoverablePlError";
  constructor(status: Status) {
    super(status);
  }
}

export class UnrecoverablePlError extends PlError {
  name = "UnrecoverablePlError";
  constructor(status: Status) {
    super(status);
  }
}

export class UnauthenticatedError extends Error {
  name = "UnauthenticatedError";
  constructor(message: string) {
    super("LoginFailed: " + message);
  }
}

export class DisconnectedError extends Error {
  name = "DisconnectedError";
  constructor(message: string) {
    super("Disconnected: " + message);
  }
}

export class RESTError extends PlError {
  name = "RESTError";
  constructor(status: Status, opts?: ErrorOptions) {
    super(status, opts);
  }
}

export function rethrowMeaningfulError(error: any, wrapIfUnknown: boolean = false): never {
  if (isUnauthenticated(error)) {
    if (error instanceof UnauthenticatedError) throw error;
    throw new UnauthenticatedError(error.message);
  }
  if (isConnectionProblem(error)) {
    if (error instanceof DisconnectedError) throw error;
    throw new DisconnectedError(error.message);
  }
  if (isTimeoutOrCancelError(error)) throw new Aborted(error);
  if (wrapIfUnknown) {
    const message = error.message || String(error) || "Unknown error";
    throw new Error(message, { cause: error });
  } else throw error;
}
