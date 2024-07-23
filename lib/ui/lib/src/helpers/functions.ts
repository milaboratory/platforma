export function tap<T, R>(v: T, cb: (v: T) => R) {
  return cb(v);
}

export function tapIf<T, R>(v: T | null | undefined, cb: (v: T) => R) {
  if (v !== null && v !== undefined) {
    return cb(v);
  }
}

export function flatValue<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

export function generate<R>(count: number, cb: (i: number) => R): R[] {
  const r: R[] = [];
  for (let i = 0; i < count; i++) {
    r.push(cb(i));
  }
  return r;
}

export function copyProps<T extends Record<string, unknown>>(target: T, source: T, ...keys: (keyof T)[]) {
  keys.forEach((key) => {
    target[key] = source[key];
  });
}
