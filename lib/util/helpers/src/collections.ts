import type { GroupBy } from "./types";

export function arrayDiff<T>(arr1: T[], arr2: T[]): T[] {
  return arr1.filter(x => !arr2.includes(x));
}

export function pushValueIm<T>(arr: T[], value: T): T[] {
  return [...arr, value];
}

export function addUnique<T>(arr: readonly T[], value: T): T[] {
  if (!arr.includes(value)) {
    return [...arr, value];
  }
  return [...arr];
}

export function pushUnique<T>(arr: T[], value: T) {
  if (!arr.includes(value)) {
    arr.push(value);
  }
}

export function intersection<T>(a: T[], b: T[]): T[] {
  return a.filter(value => b.includes(value));
}

export function unionUnique<T>(a: T[], b: T[]): T[] {
  const arr = [...a];
  b.forEach(v => pushUnique(arr, v));
  return arr;
}

export function intersectionAll<T>(pack: T[][]) {
  let arr = pack.shift();

  if (!arr) {
    return [];
  }

  for (const a of pack) {
    arr = intersection(arr, a);
  }

  return arr;
}

export function maxValue(arr: number[]) {
  return arr.reduce((a, b) => Math.max(a, b), -Infinity);
}

export function mutableDeleteIndices<T>(arr: T[], indices: number[]) {
  [...indices].sort((a, b) => b - a).forEach(i => arr.splice(i, 1));
}

export function deleteIndices<T>(arr: T[], indices: number[]): T[] {
  return arr.filter((v, i) => !indices.includes(i));
}

export function aggregateBy<It extends Record<string, unknown>, K extends keyof It>(items: It[], groupKey: K) {
  const map = items.reduce((m, it) => {
    const groupValue = it[groupKey] as string;

    if (!m.has(groupValue)) {
      m.set(groupValue, {});
    }

    const r = m.get(groupValue) as Record<string, unknown[]>;

    Object.keys(it).filter(k => k !== groupKey).forEach(k => {
      r[k] = addUnique(r[k] || [], it[k]);
    });

    return m;
  }, new Map<string, Record<string, unknown>>);

  return [...map.entries()].map(([k, m]) => {
    return {
      [groupKey]: k,
      ...m
    };
  }) as GroupBy<It, K>[];
}

export function predicateUnique<V, I, A extends V[]>(value: V, index: I, array: A) {
  return array.indexOf(value) === index;
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

export function rotate<T>(v: T, lst: T[]) {
  const next = lst.indexOf(v) + 1;
  return lst[next >= lst.length ? 0 : next];
}

export function uniques<T, V>(items: T[], cb: (s: Set<V>, it: T) => void): V[] {
  const s = items.reduce((s, it) => {
    cb(s, it);
    return s;
  }, new Set<V>());

  return Array.from(s.values());
}

export function toSorted<T>(arr: readonly T[], compareFn?: (a: T, b: T) => number): T[] {
  return arr.slice().sort(compareFn);
}

/**
 * Returns a first contiguous copy of a section of an array where predicate is true
 * @param arr 
 * @param predicate 
 * @returns 
 */
export function sliceBy<T>(arr: readonly T[], predicate: (el: T, index: number) => boolean): T[] {
  const left = arr.findIndex(predicate);

  if (left < 0) {
    return [];
  }

  const right = (() => {
    for (let i = left; i < arr.length; i++) {
      if (predicate(arr[i], i)) {
        continue;
      }
  
      return i;
    }

    return arr.length;
  })();

  return arr.slice(left, right);
}
