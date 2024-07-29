export function toComparable(v: unknown) {
  if (typeof v === 'number') {
    return v;
  } else if (typeof v === 'string') {
    return v;
  } else {
    return String(v);
  }
}

export function compareRecords(sorts: Record<string, 'ASC' | 'DESC'>, a: Record<string, unknown>, b: Record<string, unknown>) {
  for (const [name, direction] of Object.entries(sorts)) {
    const v1 = toComparable(a[name]);
    const v2 = toComparable(b[name]);

    const rev = direction === 'DESC' ? -1 : 1;

    if (v1 === v2) {
      continue;
    }

    return (v1 > v2 ? 1 : -1) * rev;
  }

  return 0;
}

export const identity = <T>(v: T): T => v;

export function rotate<T>(v: T, lst: T[]) {
  const next = lst.indexOf(v) + 1;
  return lst[next >= lst.length ? 0 : next];
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
