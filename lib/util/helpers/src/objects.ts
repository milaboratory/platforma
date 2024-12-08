/* eslint-disable  @typescript-eslint/no-explicit-any */

import type { PartialBy, PlainObject } from './types';

export const isArray = Array.isArray;

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export function isObject<V, T extends Record<string, V>>(obj: T | unknown): obj is T {
  return obj !== null && typeof obj === 'object';
}

export function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null);
}

export function map<U, T extends Record<string, unknown>>(obj: T, callback: (curr: T[keyof T], key: keyof T) => U) {
  const keys = Object.keys(obj) as Array<keyof T>;

  return keys.map((key: keyof T) => {
    return callback(obj[key], key);
  });
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (!(isObject(a) && isObject(b))) {
    return a === b;
  }

  if (Object.keys(a).length !== Object.keys(b).length) {
    return false;
  }

  return Object.keys(a).every((k) => deepEqual(a[k], b[k]));
}

export function deepClone<T>(obj: T): T {
  if (Array.isArray(obj)) {
    const copy: any[] = [];
    for (let i = 0; i < obj.length; i++) {
      copy[i] = deepClone(obj[i]) as unknown;
    }
    return copy as T;
  } else if (isObject(obj)) {
    const copy: Record<string, any> = {};
    Object.keys(obj).forEach((k) => {
      copy[k] = deepClone(obj[k]);
    });
    return copy as T;
  } else {
    return obj;
  }
}

export function shallowClone<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return Object.assign([], obj);
  } else if (isObject(obj)) {
    return Object.assign({}, obj);
  } else {
    return obj;
  }
}

export function shallowDiff<T>(to: T, from: T): Partial<T> {
  const diff: Partial<T> = {};

  for (const key in from) {
    if (from[key] !== to[key]) {
      diff[key] = to[key];
    }
  }

  return diff;
}

export function bindMethods<O extends Record<string, unknown>>(obj: O) {
  Object.entries(obj).forEach(([key, m]) => {
    if (m instanceof Function) {
      // @ts-expect-error (safe)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      obj[key] = m.bind(obj);
    }
  });

  return obj;
}

export function setProp<O, K extends keyof O>(obj: O, key: K, value: O[K]) {
  obj[key] = value;
  return obj;
}

export function getProp<O, K extends keyof O>(obj: O, key: K): O[K] {
  return obj[key];
}

export function shiftProp<O, K extends keyof O>(obj: O, key: K): [O[K], Omit<O, K>] {
  obj = { ...obj };
  const val = obj[key];
  delete obj[key];
  return [val, obj];
}

export function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  return Object.assign({}, ...keys.map((k) => ({ [k]: obj[k] }))) as Pick<T, K>;
}

export function pickValues<T, K extends keyof T>(obj: T, ...keys: K[]) {
  return keys.map((k) => obj[k]);
}

export function omit<T, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const o = Object.assign({}, obj) as PartialBy<T, K>;
  keys.forEach((k) => delete o[k]);
  return o;
}

export function deepPatch<T extends PlainObject | unknown[]>(target: T, source: T) {
  const sk = new Set<keyof T>([...Object.keys(target) as (keyof T)[], ...Object.keys(source) as (keyof T)[]]);

  sk.forEach((key) => {
    const t = target[key];
    const s = source[key];
    if (isPlainObject(t) && isPlainObject(s)) {
      deepPatch(t, s);
    } else if (isArray(t) && isArray(s) && t.length === s.length) {
      deepPatch(t, s);
    } else {
      target[key] = s;
    }
  });

  return target;
}
