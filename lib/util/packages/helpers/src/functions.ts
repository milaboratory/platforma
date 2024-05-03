import type {AnyFunction} from './types';

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

export function promiseTimeout<T>(prom: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race<T>([prom, new Promise((_r, reject) => setTimeout(() => reject(`Timeout exceeded ${ms}`), ms))]);
}

export function debounce<F extends AnyFunction>(callback: F, ms: number, immediate?: boolean): (...args: Parameters<F>) => void {
  let timeout: NodeJS.Timeout | undefined;
  return function (this: unknown, ...args: Parameters<F>) {
    const i = immediate && !timeout;
    i && callback.apply(this, args);
    timeout && clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = undefined;
      !i && callback.apply(this, args);
    }, ms);
  };
}

export function throttle<F extends AnyFunction>(callback: F, ms: number, trailing = true): (...args: Parameters<F>) => void {
  let t = 0, call: AnyFunction | null;
  return function (this: unknown, ...args: Parameters<F>) {
    call = () => {
      callback.apply(this, args);
      t = new Date().getTime() + ms;
      call = null;
      trailing && setTimeout(() => {
        call && call();
      }, ms);
    };
    if (new Date().getTime() > t) call();
  };
}

export const memoize = <F extends AnyFunction>(fn: F) => {
  const cache = new Map();
  return function ( ...args: Parameters<F>): ReturnType<F> {
    const key = JSON.stringify(args);
    return cache.has(key)
      ? cache.get(key)
      : cache.set(key, fn.call(null, ...args)) && cache.get(key);
  };
};
