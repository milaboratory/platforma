import {
  mapIterable,
  flatMapIterable,
  filterIterable,
  sliceIterable,
  mergeIterable,
  throttleIterable,
} from './iterators/async';

export class AsyncSequence<T> {
  constructor(private iterable: AsyncIterable<T>) {
  }

  merge<B>(b: AsyncSequence<B>) {
    return new AsyncSequence(mergeIterable(this.it(), b.it()));
  }

  map<R>(cb: (v: T) => R) {
    return new AsyncSequence(mapIterable(this.iterable, cb));
  }

  flatMap<R>(cb: (v: T) => Promise<R[]>) {
    return new AsyncSequence(flatMapIterable(this.iterable, cb));
  }

  throttle(dt: number, options?: { leading?: boolean; trailing?: boolean }) {
    return new AsyncSequence(throttleIterable(this.iterable, dt, options ?? {}));
  }

  filter(cb: (v: T) => boolean | Promise<boolean>) {
    return new AsyncSequence(filterIterable(this.iterable, cb));
  }

  slice(from: number, to: number) {
    return new AsyncSequence(sliceIterable(this.iterable, from, to));
  }

  async until(cb: (v: T) => Promise<boolean>) {
    for await (const v of this.iterable) {
      if (await cb(v)) {
        return v;
      }
    }
  }

  take(n: number) {
    if (n < 1) {
      throw Error('take param should be greater than 0');
    }
    return this.slice(0, n);
  }

  async reduce<R>(cb: (acc: R, v: T) => R, acc: R) {
    for await (const v of this.iterable) {
      acc = cb(acc, v);
    }
    return acc;
  }

  it() {
    return this.iterable;
  }

  async toArray() {
    const values: T[] = [];
    for await (const v of this.iterable) {
      values.push(v);
    }
    return values;
  }
}
