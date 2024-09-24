export function* mapIterable<T, R>(it: Iterable<T>, cb: (v: T) => R) {
  for (const v of it) {
    yield cb(v);
  }
}

export function* filterIterable<T>(it: Iterable<T>, cb: (v: T) => boolean) {
  for (const v of it) {
    if (cb(v)) {
      yield v;
    }
  }
}

export function toList<T>(it: Iterable<T>) {
  const res: T[] = [];
  for (const v of it) {
    res.push(v);
  }
  return res;
}
