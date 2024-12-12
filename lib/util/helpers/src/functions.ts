import type { AnyFunction } from './types';

/**
 * A utility class that ensures asynchronous locks, allowing only one task to proceed at a time.
 */
export class AwaitLock {
  private acquired = false;
  private resolvers: (() => void)[] = [];

  acquireAsync(): Promise<void> {
    if (!this.acquired) {
      this.acquired = true;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  release(): void {
    if (!this.acquired) {
      throw new Error('Cannot release an unacquired lock');
    }

    if (this.resolvers.length) {
      this.resolvers.shift()?.();
    } else {
      this.acquired = false;
    }
  }
}

/**
 * A utility to add a timeout to a promise, rejecting the promise if the timeout is exceeded.
 */
export function promiseTimeout<T>(prom: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race<T>([prom, new Promise((_r, reject) => setTimeout(() => reject(Error(`Timeout exceeded ${ms}`)), ms))]);
}

/**
 * Debounce utility: delays the execution of a function until a certain time has passed since the last call.
 * @param callback
 * @param ms
 * @param immediate (if first call is required)
 * @returns
 */
export function debounce<F extends AnyFunction>(callback: F, ms: number, immediate?: boolean): (...args: Parameters<F>) => void {
  let timeout: number | undefined;
  return function (this: unknown, ...args: Parameters<F>) {
    const i = immediate && !timeout;
    if (i) {
      callback.apply(this, args);
    }
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = undefined;
      if (!i) {
        callback.apply(this, args);
      }
    }, ms);
  };
}

/**
 * Throttle utility: ensures a function is called at most once every `ms` milliseconds.
 * @param callback
 * @param ms milliseconds
 * @param trailing (ensure last call)
 * @returns
 */
export function throttle<F extends AnyFunction>(callback: F, ms: number, trailing = true): (...args: Parameters<F>) => void {
  let t = 0, call: AnyFunction | null;
  return function (this: unknown, ...args: Parameters<F>) {
    call = () => {
      callback.apply(this, args);
      t = new Date().getTime() + ms;
      call = null;
      if (trailing) {
        setTimeout(() => {
          call?.();
        }, ms);
      }
    };
    if (new Date().getTime() > t) call();
  };
}

/**
 * Memoization utility: caches results of function calls based on their arguments to avoid redundant calculations.
 */
export const memoize = <F extends AnyFunction>(fn: F) => {
  const cache = new Map();
  return function (...args: Parameters<F>): ReturnType<F> {
    const key = JSON.stringify(args);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return cache.has(key)
      ? cache.get(key)
      : cache.set(key, fn.call(null, ...args)) && cache.get(key);
  };
};

/**
 * Function wrapper utility: executes a function before the main function is called.
 */
export const wrapFunction = <T extends unknown[], U>(
  fn: (...args: T) => U,
  before: () => void,
) => {
  return (...args: T): U => {
    before();
    return fn(...args);
  };
};

/**
 * Function piping utility: allows chaining of functions by passing the result of one as input to another
 */
export function pipe<A, B>(cb: (a: A) => B) {
  const fn = (a: A) => cb(a);

  fn.pipe = <C>(next: (b: B) => C) => pipe((a: A) => next(cb(a)));

  return fn;
}

/**
 * Ensures that only one request can be processed at a time.
 */
export function exclusiveRequest<A, R>(request: (...args: A[]) => Promise<R>) {
  let counter = 0n;
  let ongoingOperation: Promise<R> | undefined;

  return async function (...params: A[]): Promise<{
    ok: false;
  } | {
    ok: true;
    value: R;
  }> {
    const myId = ++counter;

    try {
      await ongoingOperation;
    } catch (_cause: unknown) {
      // ignoring the error here, original caller will receive any rejections
    }

    // checking that this update is still the most recent
    if (counter !== myId) {
      return {
        ok: false,
      };
    }

    const promise = request(...params);

    ongoingOperation = promise;

    const value = await promise;

    return {
      ok: true,
      value,
    };
  };
}
