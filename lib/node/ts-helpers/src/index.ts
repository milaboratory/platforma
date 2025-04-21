export * from './map';
export * from './log';
export * from './vore';
export * from './temporal';
export * from './concurrent';
export * from './concurrent/async_queue';
export * from './concurrent/concurrency_limiter';
export * from './concurrent/task_processor';
export * from './concurrent/retryable_promise';
export * from './retries';
export * from './counter';
export * from './crypto/signer';
export * from './files';
export * from './obj';

export function assertNever(x: never): never {
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  throw new Error('Unexpected object: ' + x);
}

export function notEmpty<T>(v: T | null | undefined, message?: string): T {
  if (v === null || v === undefined) {
    throw Error(message ?? 'Variable is not defined');
  }
  return v;
}
