import type { Option } from "./types";

export function notEmpty<T>(v: T | null | undefined, message?: string): T {
  if (v === null || v === undefined) {
    throw Error(message ?? 'Empty (null | undefined) value');
  }

  return v;
}

export function notUndef<T>(v: T | undefined, message?: string): T {
  if (v === undefined) {
    throw Error(message ?? 'Undefined value');
  }

  return v;
}

export type Undef<T> = T | undefined;

export function undef<V>(v: V | undefined = undefined): V | undefined {
  return v;
}

export function bool<V extends boolean>(v: V): boolean {
  return v;
}

export function uniqueValues<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function checkIfNotEmpty<T>(v: T | null | undefined, message?: string): asserts v is T {
  if (v === undefined || v === null) {
    throw Error(message ?? 'Empty (null | undefined) value');
  }
}

export function checkIfDefined<T>(v: T | undefined, message?: string): asserts v is T {
  if (v === undefined) {
    throw Error(message ?? 'Undefined value');
  }
}

export function between(n: number, a: number, b: number) {
  const min = Math.min(a, b);
  const max = Math.max(a, b);

  return n >= min && n <= max;
}

export function listToOptions<T>(list: T[] | readonly T[]): Option<T>[] {
  return list.map((value) => ({ text: String(value), value }));
}

export function async<A extends unknown[]>(gf: (...args: A) => Generator) {
  return function (...args: A) {
    const generator = gf(...args);

    async function handle(result: IteratorResult<unknown>): Promise<unknown> {
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

export class Deferred<T> {
  public readonly promise: Promise<T>;
  public resolve: (v: T) => void = () => {};
  public reject: (err: Error) => void = () => {};
  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function tear() {
  return new Promise<void>(r => queueMicrotask(r));
}

export function timer() {
  const t = new Date().getTime();
  return function () {
    return new Date().getTime() - t;
  };
}

export function call<R>(f: () => R): R {
  return f();
}

export function clamp(n: number, lo: number, up: number) {
  return lo > n ? lo : n > up ? up : n;
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

export function *iterateByPairs<T>(iterable: Iterable<T>): Generator<[T, T]> {
  const acc: T[] = [];
  for (const it of iterable) {
    acc.push(it);
    if (acc.length === 2) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      yield [acc[0]!, acc[1]!];
      acc.shift();
    }
  }
}

export function exhaustive(v: never, message: string): never {
  throw Error(message);
}

export type Matcher<T extends string, R = unknown> = {
  [P in T]: () => R;
};

export function match<T extends string, R = unknown>(matcher: Matcher<T, R>) {
  return (key: T) => matcher[key]();
}

export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type OkType<R extends Result<unknown>> = Extract<R, { ok: true }>['value'];  

export function okOptional<V>(v: Result<V> | undefined) {
  if (!v) {
    return undefined;
  }

  if (v.ok) {
    return v.value;
  }
}

export function errorOptional<V>(v: Result<V> | undefined) {
  if (!v) {
    return undefined;
  }

  if (!v.ok) {
    return v.error;
  }
}

export function flatValue<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}
