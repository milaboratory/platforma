export function notEmpty<T>(v: T | null | undefined, message?: string): T {
  if (v === null || v === undefined) {
    throw Error(message ?? 'Variable is not defined');
  }

  return v;
}

export function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x);
}
