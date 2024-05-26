export * from './map';
export * from './log';
export * from './temporal';
export * from './concurrent';
export * from './concurrent/async_queue';
export * from './concurrent/task_processor';
export * from './retries';

export function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x);
}

export function notEmpty<T>(v: T | null | undefined, message?: string): T {
  if (v === null || v === undefined) {
    throw Error(message ?? 'Variable is not defined');
  }
  return v;
}
