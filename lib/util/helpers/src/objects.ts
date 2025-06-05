/* eslint-disable  @typescript-eslint/no-explicit-any */

import type { PartialBy, PlainObject } from './types';

/**
 * Alias to Array.isArray
 */
export const isArray = Array.isArray;

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export function isNonPrimitive<V, T extends PlainObject<V> | V[]>(obj: T | unknown): obj is T {
  return obj !== null && typeof obj === 'object';
}

export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * Checks if the given value is a plain object.
 *
 * A plain object is defined as an object created by the `{}` literal,
 * an object created with `Object.create(null)`, or an object with a
 * prototype that resolves to `Object.prototype`.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a plain object, otherwise `false`.
 *
 * @example
 * ```typescript
 * isPlainObject({}); // true
 * isPlainObject(Object.create(null)); // true
 * isPlainObject(new Date()); // false
 * isPlainObject(null); // false
 * isPlainObject([]); // false
 * ```
 */
export function isPlainObject(value: unknown): value is PlainObject {
  if (!isObject(value)) {
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

function definedKeysSize(obj: PlainObject) {
  return Object.values(obj).reduce((length: number, v) => {
    return v !== undefined ? length + 1 : length;
  }, 0);
}

/**
 * Performs a deep equality check between two values, `a` and `b`, to determine if they are JSON-equivalent.
 *
 * JSON equivalence means that the two values are strictly equal in structure and content, including arrays and plain objects.
 * Non-primitive values that are neither arrays nor plain objects will throw an error.
 *
 * @param a - The first value to compare.
 * @param b - The second value to compare.
 * @returns `true` if the values are JSON-equivalent, otherwise `false`.
 *
 * @throws If the values are non-primitive and not arrays or plain objects.
 *
 * @example
 * ```typescript
 * isJsonEqual(1, 1); // true
 * isJsonEqual({ a: 1 }, { a: 1 }); // true
 * isJsonEqual([1, 2], [1, 2]); // true
 * isJsonEqual({ a: 1 }, { a: 2 }); // false
 * isJsonEqual([1, 2], [2, 1]); // false
 * isJsonEqual(new Date(), new Date()); // Error
 * ```
 */
export function isJsonEqual(a: unknown, b: unknown): boolean {
  if (!(isNonPrimitive(a) && isNonPrimitive(b))) {
    return a === b;
  }

  if (isArray(a) && isArray(b)) {
    if (a.length !== b.length) {
      return false;
    } else {
      return [...a.keys()].every((k) => isJsonEqual(a[k], b[k]));
    }
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    if (definedKeysSize(a) !== definedKeysSize(b)) {
      return false;
    }

    return Object.keys(a).every((k) => isJsonEqual(a[k], b[k]));
  }

  /* eslint-disable @typescript-eslint/no-base-to-string */
  throw Error(`Cannot compare a ${String(a)} and b ${String(b)}`);
}

/**
 * Alias to isJsonEqual function
 * @deprecated change to isJsonEqual
 */
export const deepEqual = isJsonEqual;

export function deepClone<T>(obj: T): T {
  if (Array.isArray(obj)) {
    const copy: any[] = [];
    for (let i = 0; i < obj.length; i++) {
      copy[i] = deepClone(obj[i]) as unknown;
    }
    return copy as T;
  } else if (isPlainObject(obj)) {
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
  } else if (isNonPrimitive(obj)) {
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      obj[key as keyof O] = m.bind(obj);
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

/**
 * Performs a deep patch of the target object or array using the source object or array.
 *
 * This function recursively merges properties of the source into the target:
 * - If a property in both target and source is a plain object, they are recursively merged.
 * - If a property in both target and source is an array of the same length, the arrays are recursively patched element by element.
 * - Otherwise, the property value in the target is replaced by the corresponding value from the source.
 *
 * The patch is applied in-place to the target object or array, which is also returned for convenience.
 *
 * @typeParam T - The type of the target and source, which must be either a plain object or an array.
 * @param target - The target object or array to be patched. This object/array is modified in-place.
 * @param source - The source object or array providing the new values for the patch.
 * @returns The modified target object or array.
 *
 * @example
 * ```typescript
 * const target = { a: { b: 1 }, c: [1, 2] };
 * const source = { a: { b: 2 }, c: [3, 4], d: 5 };
 * const result = deepPatch(target, source);
 * // target is now: { a: { b: 2 }, c: [3, 4], d: 5 }
 * // result is the same reference as target.
 *
 * const targetArray = [{ a: 1 }, { b: 2 }];
 * const sourceArray = [{ a: 2 }, { b: 3 }];
 * const resultArray = deepPatch(targetArray, sourceArray);
 * // targetArray is now: [{ a: 2 }, { b: 3 }]
 * ```
 */
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
