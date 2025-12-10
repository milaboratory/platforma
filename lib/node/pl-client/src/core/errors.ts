import type { Status } from '../proto-grpc/github.com/googleapis/googleapis/google/rpc/status';
import { Aborted } from '@milaboratories/ts-helpers';
import { Code } from '../proto-grpc/google/rpc/code';

export function isConnectionProblem(err: unknown, nested: boolean = false): boolean {
  if (err instanceof DisconnectedError) return true;
  if ((err as any).name == 'RpcError' && (err as any).code == 'UNAVAILABLE') return true;
  if ((err as any).code == Code.UNAVAILABLE) return true;
  // TypeError from WebSocket disconnection (often has empty message)
  // Check both the error itself and its cause chain
  if (err instanceof TypeError) {
    // Empty message often indicates WebSocket connection issue
    if (!(err as any).message || (err as any).message === '') return true;
    // Also check if it's a WebSocket-related TypeError
    const stack = (err as any).stack || '';
    if (stack.includes('WebSocket') || stack.includes('websocket')) return true;
  }
  if ((err as any).name === 'TypeError') {
    if (!(err as any).message || (err as any).message === '') return true;
  }
  if ((err as any).cause !== undefined && !nested)
    // nested limits the depth of search
    return isConnectionProblem((err as any).cause, true);
  return false;
}

export function isUnauthenticated(err: unknown, nested: boolean = false): boolean {
  if (err instanceof UnauthenticatedError) return true;
  if ((err as any).name == 'RpcError' && (err as any).code == 'UNAUTHENTICATED') return true;
  if ((err as any).code == Code.UNAUTHENTICATED) return true;
  if ((err as any).cause !== undefined && !nested)
    // nested limits the depth of search
    return isUnauthenticated((err as any).cause, true);
  return false;
}

export function isTimeoutOrCancelError(err: unknown, nested: boolean = false): boolean {
  if (err instanceof Aborted || (err as any).name == 'AbortError') return true;
  if ((err as any).name == 'TimeoutError') return true;
  if ((err as any).code == 'ABORT_ERR') return true;
  // Check for DOMException with ABORT_ERR code (thrown by AbortSignal.timeout)
  if (err instanceof DOMException && err.code === DOMException.ABORT_ERR) return true;
  if ((err as any).code == Code.ABORTED) return true;
  if (
    (err as any).name == 'RpcError'
    && ((err as any).code == 'CANCELLED' || (err as any).code == 'DEADLINE_EXCEEDED')
  )
    return true;
  if ((err as any).code == Code.CANCELLED || (err as any).code == Code.DEADLINE_EXCEEDED)
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
  if (isUnauthenticated(error)) {
    const message = error.message || String(error) || 'Unauthenticated';
    throw new UnauthenticatedError(message);
  }
  if (isConnectionProblem(error)) {
    // For connection problems, provide a more descriptive message
    let message = error.message;
    // If message is empty, just the error name, or matches common unhelpful patterns,
    // provide a more descriptive message
    if (!message || message === '' || message === error.name || message === 'TypeError') {
      // Check if it's a WebSocket-related error
      if (error instanceof TypeError || error.name === 'TypeError') {
        message = 'WebSocket connection closed';
      } else {
        message = 'Connection problem';
      }
    }
    throw new DisconnectedError(message);
  }
  if (isTimeoutOrCancelError(error)) throw new Aborted(error);
  if (wrapIfUnknown) {
    const message = error.message || String(error) || 'Unknown error';
    throw new Error(message, { cause: error });
  }
  else throw error;
}
