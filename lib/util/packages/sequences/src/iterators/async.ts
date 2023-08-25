import {Emitter} from '../tools';

export async function* mergeIterable<T, B>(it1: AsyncIterable<T>, it2: AsyncIterable<B>): AsyncIterable<T | B> {
  const em = new Emitter<T | B>();

  const race = [it1, it2].map(it => {
    return (async () => {
      for await (const v of it) {
        em.emit(v);
      }
    })();
  });

  Promise.allSettled(race).then(() => {
    em.stop();
  }).catch(console.error);

  yield* em.it();
}

export async function* mapIterable<T, R>(it: AsyncIterable<T>, cb: (v: T) => R) {
  for await (const v of it) {
    yield cb(v);
  }
}

export async function* filterIterable<T>(it: AsyncIterable<T>, cb: (v: T) => boolean) {
  for await (const v of it) {
    if (cb(v)) {
      yield v;
    }
  }
}

export async function* sliceIterable<T>(it: AsyncIterable<T>, from: number, to: number) {
  let i = 0;
  for await (const v of it) {
    if (i >= to) {
      break;
    }
    if (i >= from) {
      yield v;
    }
    i++;
  }
}
