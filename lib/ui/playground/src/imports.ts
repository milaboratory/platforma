export function generate<R>(count: number, cb: (i: number) => R): R[] {
  const r: R[] = [];
  for (let i = 0; i < count; i++) {
    r.push(cb(i));
  }
  return r;
}