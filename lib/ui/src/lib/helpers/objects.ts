export function isRecord<V, T extends Record<string, V>>(obj: T | unknown): obj is T {
  return obj !== null && typeof obj === 'object';
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (!(isRecord(a) && isRecord(b))) {
    return a === b;
  }

  if (Object.keys(a).length !== Object.keys(b).length) {
    return false;
  }

  return Object.keys(a).every(k => deepEqual(a[k], b[k]));
}
