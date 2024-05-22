export * from './map';
export * from './log';
export * from './temporal';
export * from './test_helpers';
export * from './concurrent';
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
