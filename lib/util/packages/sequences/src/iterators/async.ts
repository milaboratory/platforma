import {Emitter} from '../tools';

function getTime() {
  return new Date().getTime();
}

function timerPassed() {
  let t = getTime();
  return function (dt: number) {
    const d = getTime() - t;
    return d > dt ? !!(t = getTime()) : false;
  }
}

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

export async function* flatMapIterable<T, R>(it: AsyncIterable<T>, cb: (v: T) => Promise<R[]>) {
  for await (const v of it) {
    const items = await cb(v);
    for (const it of items) {
      yield it;
    }
  }
}

export async function* throttleIterable<T, R>(
  it: AsyncIterable<T>,
  dt: number,
  options: { leading?: boolean; trailing?: boolean }) {
  const passed = timerPassed();

  const state = {
    leading: options.leading ?? true,
    trailing: options.trailing ?? false,
    trailingValue: [] as T[]
  };

  for await (const v of it) {
    if (state.leading) {
      yield v;
      state.leading = false;
    } else if (passed(dt)) {
      yield v;
      state.trailingValue = [];
    } else {
      state.trailingValue = [v];
    }
  }

  if (state.trailing && state.trailingValue.length) {
    yield state.trailingValue[0];
  }
}

export async function* filterIterable<T>(it: AsyncIterable<T>, cb: (v: T) => boolean | Promise<boolean>) {
  for await (const v of it) {
    if (await cb(v)) {
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
