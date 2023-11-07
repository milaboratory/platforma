/* eslint-disable  @typescript-eslint/no-explicit-any */

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export function isObject<V, T extends Record<string, V>>(obj: T | unknown): obj is T {
  return obj !== null && typeof obj === 'object';
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

  return Object.keys(a).every(k => deepEqual(a[k], b[k]));
}

export function deepClone<T>(obj: T): T {
  if (Array.isArray(obj)) {
    const copy: any = [];
    for (let i = 0; i < obj.length; i++) {
      copy[i] = deepClone(obj[i]);
    }
    return copy as T;
  } else if (isObject(obj)) {
    const copy: any = {};
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

export function iSet<T extends Record<string, any>, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  return Object.assign({}, obj, {
    [key]: value
  });
}

export function bindMethods<O extends Record<string, unknown>>(obj: O) {
  Object.entries(obj).forEach(([key, m]) => {
    if (m instanceof Function) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
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
  obj = {...obj};
  const val = obj[key];
  delete obj[key];
  return [val, obj];
}

export function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  return Object.assign({}, ...keys.map(k => ({[k]: obj[k]})));
}

export function omit<T, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const o = Object.assign({}, obj) as PartialBy<T, K>;
  keys.forEach(k => delete o[k]);
  return o;
}
