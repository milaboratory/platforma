export function async<A extends unknown[]>(gf: (...args: A) => Generator) {
  return function (...args: A) {
    const generator = gf(...args);

    function handle(result: IteratorResult<unknown>): Promise<unknown> {
      if (result.done) {
        return Promise.resolve(result.value);
      }

      return Promise.resolve(result.value).then(res => {
        return handle(generator.next(res));
      }).catch(err => {
        return handle(generator.throw(err));
      });
    }

    try {
      return handle(generator.next());
    } catch (ex) {
      return Promise.reject(ex);
    }
  }
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function timer() {
  const t = new Date().getTime();
  return function () {
    return new Date().getTime() - t;
  };
}

export function tap<T, R>(v: T, cb: (v: T) => R) {
  return cb(v);
}

export function tapIf<T, R>(v: T | null | undefined, cb: (v: T) => R) {
  if (v !== null && v !== undefined) {
    return cb(v);
  }

  return;
}

export function randomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

export function *range(n: number) {
  for (let i = 0; i < n; i++) {
    yield i;
  }
}

export class Interval {
  constructor(private _delay: number) {
  }
  async *generate(): AsyncGenerator<number> {
    let i = 0;
    while (true) {
      await delay(this._delay);
      yield i++;
    }
  }
  async *[Symbol.asyncIterator]() {
    let i = 0;
    while (true) {
      await delay(this._delay);
      yield i++;
    }
  }
}

export function arrayFrom<T>(length: number, cb: (i: number) => T) {
  return Array.from({length}, (_, i) => cb(i));
}
