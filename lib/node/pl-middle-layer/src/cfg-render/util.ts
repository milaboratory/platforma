export function mapRecord<T1, T2, Key extends string>(
  obj: Record<Key, T1>,
  mapper: (value: T1) => T2
): Record<Key, T2> {
  const result = {} as Record<Key, T2>;
  for (const [key, value] of Object.entries(obj))
    result[key as Key] = mapper(value as T1);
  return result;
}
