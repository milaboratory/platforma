export function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x);
}

export function notEmpty<T>(v: T | null | undefined, message?: string): T {
  if (v === null || v === undefined) {
    throw Error(message ?? 'Variable is not defined');
  }

  return v;
}

export function toBytes(value: string | Uint8Array): Uint8Array {
  if (typeof value === 'string')
    return Buffer.from(value);
  else
    return value;
}
