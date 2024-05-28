import { Status } from '../proto/github.com/googleapis/googleapis/google/rpc/status';
import { Aborted } from '@milaboratory/ts-helpers';

export function isTimeoutOrCancelError(err: any, nested: boolean = false): boolean {
  if (!(err instanceof Error))
    return false;
  if (err instanceof Aborted)
    return true;
  if ((err as any).name === 'RpcError' && ((err as any).code === 'CANCELLED' || (err as any).code === 'DEADLINE_EXCEEDED'))
    return true;
  if (err.cause !== undefined && !nested)
    return isTimeoutOrCancelError(err.cause, true);
  return false;
}

export const PlErrorCodeNotFound = 5;

export class PlError extends Error {
  constructor(public readonly status: Status) {
    super(`code=${status.code} ${status.message}`);
  }
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

export function isNotFoundError(err: any): boolean {
  return err instanceof RecoverablePlError && err.status.code === PlErrorCodeNotFound;
}
