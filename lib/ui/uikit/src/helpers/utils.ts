import type { ListOption } from '../types';

export function call<R>(f: () => R): R {
  return f();
}

export function notEmpty<T>(v: T | null | undefined, message: string): T {
  if (v === null || v === undefined) {
    throw Error(message);
  }

  return v;
}

export function requestTick<P>(cb: (...args: P[]) => void) {
  let tick = false;

  return function handle(...args: P[]) {
    if (!tick) {
      requestAnimationFrame(() => {
        cb(...args);
        tick = false;
      });
      tick = true;
    }
  };
}

export function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function timeout(cb: () => void, ms: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = setTimeout(cb, ms);
  return () => {
    clearTimeout(r);
  };
}

export function randomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

export function randomString(length: number) {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(randomInt(65, 91));
  }
  return s;
}

export function makeEaseOut(timing: (t: number) => number) {
  return function (timeFraction: number) {
    return 1 - timing(1 - timeFraction);
  };
}

export function makeEaseInOut(timing: (t: number) => number) {
  return function (timeFraction: number) {
    if (timeFraction < 0.5) return timing(2 * timeFraction) / 2;
    else return (2 - timing(2 * (1 - timeFraction))) / 2;
  };
}

export function animate(options: { duration: number; draw: (p: number) => void; timing: (t: number) => number }) {
  const { duration, draw, timing } = options;
  const start = performance.now();
  let stop = false;
  requestAnimationFrame(function animate(time) {
    let timeFraction = (time - start) / duration;
    if (timeFraction > 1 || stop) timeFraction = 1;
    const progress = timing(timeFraction);
    draw(progress);
    if (timeFraction < 1) {
      requestAnimationFrame(animate);
    }
  });

  return function () {
    stop = true;
  };
}

export function animateInfinite(options: { getFraction: (dt: number) => number; draw: (p: number) => void; timing: (t: number) => number }) {
  const { getFraction, draw, timing } = options;
  const start = performance.now();
  let stop = false;
  requestAnimationFrame(function animate(time) {
    let timeFraction = getFraction(time - start);
    if (stop) {
      return;
    }
    if (timeFraction > 1) timeFraction = 1;
    const progress = timing(timeFraction);
    draw(progress);
    if (timeFraction < 1) {
      requestAnimationFrame(animate);
    }
  });
  return function () {
    stop = true;
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFunction = (...args: any[]) => any;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function debounce<F extends AnyFunction>(func: F, delay: number) {
  let timerId = -1;
  return (...args: Parameters<F>) => {
    if (timerId !== -1) {
      clearTimeout(timerId);
      timerId = -1;
    }
    timerId = window.setTimeout(() => func(...args), delay);
  };
}

export function throttle<F extends AnyFunction>(callback: F, ms: number, trailing = true): (...args: Parameters<F>) => void {
  let t = 0,
    call: AnyFunction | null;
  return function (this: unknown, ...args: Parameters<F>) {
    call = () => {
      callback.apply(this, args);
      t = new Date().getTime() + ms;
      call = null;
      trailing &&
        setTimeout(() => {
          call && call();
        }, ms);
    };
    if (new Date().getTime() > t) call();
  };
}

export function listToOptions<T>(list: T[] | readonly T[]): ListOption<T>[] {
  return list.map((value) => ({ text: String(value), value }));
}