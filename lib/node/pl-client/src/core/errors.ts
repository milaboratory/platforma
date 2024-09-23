import { Status } from '../proto/github.com/googleapis/googleapis/google/rpc/status';
import { Aborted } from '@milaboratories/ts-helpers';

export function isConnectionProblem(err: unknown, nested: boolean = false): boolean {
  if (err instanceof DisconnectedError) return true;
  if ((err as any).name == 'RpcError' && (err as any).code == 'UNAVAILABLE') return true;
  if ((err as any).cause !== undefined && !nested)
    // nested limits the depth of search
    return isConnectionProblem((err as any).cause, true);
  return false;
}

export function isUnauthenticated(err: unknown, nested: boolean = false): boolean {
  if (err instanceof UnauthenticatedError) return true;
  if ((err as any).name == 'RpcError' && (err as any).code == 'UNAUTHENTICATED') return true;
  if ((err as any).cause !== undefined && !nested)
    // nested limits the depth of search
    return isUnauthenticated((err as any).cause, true);
  return false;
}

export function isTimeoutOrCancelError(err: unknown, nested: boolean = false): boolean {
  if (err instanceof Aborted || (err as any).name == 'AbortError') return true;
  if ((err as any).code == 'ABORT_ERR') return true;
  if (
    (err as any).name == 'RpcError' &&
    ((err as any).code == 'CANCELLED' || (err as any).code == 'DEADLINE_EXCEEDED')
  )
    return true;
  if ((err as any).cause !== undefined && !nested)
    // nested limits the depth of search
    return isTimeoutOrCancelError((err as any).cause, true);
  return false;
}

export const PlErrorCodeNotFound = 5;

export class PlError extends Error {
  constructor(public readonly status: Status) {
    super(`code=${status.code} ${status.message}`);
  }
}

export function throwPlNotFoundError(message: string): never {
  throw new RecoverablePlError({ code: PlErrorCodeNotFound, message, details: [] });
}

export class RecoverablePlError extends PlError {
  constructor(status: Status) {
    super(status);
  }
}

export class UnrecoverablePlError extends PlError {
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
  constructor(message: string) {
    super('LoginFailed: ' + message);
  }
}

export class DisconnectedError extends Error {
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
