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

export function* sliceIterable<T>(it: Iterable<T>, from: number, to: number) {
  let i = 0;
  for (const v of it) {
    if (i >= to) {
      console.log('break');
      break;
    }
    if (i >= from) {
      yield v;
    }
    i++;
  }
}
