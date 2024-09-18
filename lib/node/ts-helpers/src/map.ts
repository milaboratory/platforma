import { notEmpty } from '.';

export function mapGet<K, V>(m: Map<K, V>, k: K) {
  return notEmpty(m.get(k));
}

export function mapEntries<K, V>(m: Map<K, V>): [K, V][] {
  const result: [K, V][] = [];
  m.forEach((v, k) => {
    result.push([k, v]);
  });

  return result;
}

export function mapFromEntries<K, V>(m: [K, V][]): Map<K, V> {
  const result: Map<K, V> = new Map();
  m.forEach(([k, v]) => result.set(k, v));
  return result;
}
