import { mapIterable, filterIterable, sliceIterable } from './iterators/sync';

export class SyncSequence<T> {
  constructor(private iterable: Iterable<T>) {}

  map<R>(cb: (v: T) => R) {
    return new SyncSequence(mapIterable(this.iterable, cb));
  }

  filter(cb: (v: T) => boolean) {
    return new SyncSequence(filterIterable(this.iterable, cb));
  }

  slice(from: number, to: number) {
    return new SyncSequence(sliceIterable(this.iterable, from, to));
  }

  reduce<R>(cb: (acc: R, v: T) => R, acc: R) {
    for (const v of this.iterable) {
      acc = cb(acc, v);
    }
    return acc;
  }

  it() {
    return this.iterable;
  }

  toArray() {
    return [...this.iterable];
  }
}
