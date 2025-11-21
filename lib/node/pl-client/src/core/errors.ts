import type { Status } from '../proto-grpc/github.com/googleapis/googleapis/google/rpc/status';
import { Aborted } from '@milaboratories/ts-helpers';

// TODO: use real google.rpc.Code enum values
const CODE_CANCELED = 1;
const CODE_DEADLINE_EXCEEDED = 4;
const CODE_ABORTED = 10;
const CODE_UNAUTHENTICATED = 12;
const CODE_UNAVAILABLE = 14;

export function isConnectionProblem(err: unknown, nested: boolean = false): boolean {
  if (err instanceof DisconnectedError) return true;
  if ((err as any).name == 'RpcError' && (err as any).code == 'UNAVAILABLE') return true;
  if ((err as any).code == CODE_UNAVAILABLE) return true;
  if ((err as any).cause !== undefined && !nested)
    // nested limits the depth of search
    return isConnectionProblem((err as any).cause, true);
  return false;
}

export function isUnauthenticated(err: unknown, nested: boolean = false): boolean {
  if (err instanceof UnauthenticatedError) return true;
  if ((err as any).name == 'RpcError' && (err as any).code == 'UNAUTHENTICATED') return true;
  if ((err as any).code == CODE_UNAUTHENTICATED) return true;
  if ((err as any).cause !== undefined && !nested)
    // nested limits the depth of search
    return isUnauthenticated((err as any).cause, true);
  return false;
}

export function isTimeoutOrCancelError(err: unknown, nested: boolean = false): boolean {
  if (err instanceof Aborted || (err as any).name == 'AbortError') return true;
  if ((err as any).code == 'ABORT_ERR') return true;
  if ((err as any).code == CODE_ABORTED) return true;
  if (
    (err as any).name == 'RpcError'
    && ((err as any).code == 'CANCELLED' || (err as any).code == 'DEADLINE_EXCEEDED')
  )
    return true;
  if ((err as any).code == CODE_CANCELED || (err as any).code == CODE_DEADLINE_EXCEEDED)
    return true;
  if ((err as any).cause !== undefined && !nested)
    // nested limits the depth of search
    return isTimeoutOrCancelError((err as any).cause, true);
  return false;
}

export const PlErrorCodeNotFound = 5;

export class PlError extends Error {
  name = 'PlError';
  constructor(public readonly status: Status) {
    super(`code=${status.code} ${status.message}`);
  }
}

export function throwPlNotFoundError(message: string): never {
  throw new RecoverablePlError({ code: PlErrorCodeNotFound, message, details: [] });
}

export class RecoverablePlError extends PlError {
  name = 'RecoverablePlError';
  constructor(status: Status) {
    super(status);
  }
}

export class UnrecoverablePlError extends PlError {
  name = 'UnrecoverablePlError';
  constructor(status: Status) {
    super(status);
  }
}

export function isNotFoundError(err: unknown, nested: boolean = false): boolean {
  if ((err as any).name == 'RpcError' && (err as any).code == 'NOT_FOUND') return true;
  if ((err as any).cause !== undefined && !nested) return isNotFoundError((err as any).cause, true);
  return err instanceof RecoverablePlError && err.status.code === PlErrorCodeNotFound;
}

export class UnauthenticatedError extends Error {
  name = 'UnauthenticatedError';
  constructor(message: string) {
    super('LoginFailed: ' + message);
  }
}

export class DisconnectedError extends Error {
  name = 'DisconnectedError';
  constructor(message: string) {
    super('Disconnected: ' + message);
  }
}

export function rethrowMeaningfulError(error: any, wrapIfUnknown: boolean = false): never {
  if (isUnauthenticated(error)) throw new UnauthenticatedError(error.message);
  if (isConnectionProblem(error)) throw new DisconnectedError(error.message);
  if (isTimeoutOrCancelError(error)) throw new Aborted(error);
  if (wrapIfUnknown) throw new Error(error.message, { cause: error });
  else throw error;
}
