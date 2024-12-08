import type { Option, AwaitedStruct, Unionize, Result } from './types';

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

      return Promise.resolve(result.value).then((res) => {
        return handle(generator.next(res));
      }).catch((err) => {
        return handle(generator.throw(err));
      });
    }

    try {
      return handle(generator.next());
    } catch (ex) {
      return Promise.reject(ex instanceof Error ? ex : Error(String(ex)));
    }
  };
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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function tear() {
  return new Promise<void>((r) => queueMicrotask(r));
}

export function timer() {
  const t = new Date().getTime();
  return function () {
    return new Date().getTime() - t;
  };
}

export function performanceTimer() {
  const t = performance.now();
  return function () {
    return performance.now() - t;
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

export function* range(from: number, to: number, step = 1) {
  for (let i = from; i < to; i += step) {
    yield i;
  }
}

export function toList<T>(iterable: Iterable<T>): T[] {
  const lst: T[] = [];
  for (const it of iterable) {
    lst.push(it);
  }

  return lst;
}

export function times<R>(n: number, cb: (i: number) => R): R[] {
  return toList(range(0, n)).map(cb);
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
  return Array.from({ length }, (_, i) => cb(i));
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

export function okOptional<V>(v: { ok: true; value: V } | { ok: false } | undefined) {
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

export function unwrap<T>(r: Result<T>): T {
  if (r.ok) {
    return r.value;
  }

  throw Error(r.error);
}

export function flatValue<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

export async function resolveAwaited<O extends Record<string, unknown>>(obj: O): Promise<AwaitedStruct<O>> {
  return Object.fromEntries(await Promise.all(Object.entries(obj).map(async ([k, v]) => [k, await v]))) as Promise<AwaitedStruct<O>>;
}

export function alike(obj: Record<string, unknown>, to: Record<string, unknown>) {
  return Object.keys(to).every((bKey) => obj[bKey] === to[bKey]);
}

export const identity = <T>(v: T): T => v;

export function asConst<const T>(v: T) {
  return v;
}

export function unionize<K extends keyof O, V, O extends Record<K, V>>(obj: O): Unionize<O>[] {
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value,
  })) as Unionize<O>[];
}
