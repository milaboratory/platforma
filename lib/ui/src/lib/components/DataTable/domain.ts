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
