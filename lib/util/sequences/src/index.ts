import {SyncSequence} from './sync';
import {AsyncSequence} from './async';
export {Emitter} from './tools';

export function sequence<T>(it: Iterable<T>): SyncSequence<T>;
export function sequence<T>(it: AsyncIterable<T>): AsyncSequence<T>;
export function sequence<T>(it: Iterable<T> | AsyncIterable<T>) {
  if (Symbol.iterator in it) {
    return new SyncSequence(it);
  }

  if (Symbol.asyncIterator in it) {
    return new AsyncSequence(it);
  }

  throw Error('sequence argument should be iterable');
}
