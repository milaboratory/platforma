import { Status } from './proto/github.com/googleapis/googleapis/google/rpc/status';

export class Aborted extends Error {
  constructor(cause: unknown) {
    super('aborted', { cause });
  }
}

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

export class PlError extends Error {
  constructor(status: Status) {
    super(status.message);
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
