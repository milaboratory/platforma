export interface ValueAndError<T> {
  value?: T;
  error?: T;
}

export function mapValueAndErrorIfDefined<T1, T2>(
  input: ValueAndError<T1> | undefined,
  mapping: (v: T1) => T2
): ValueAndError<T2> | undefined {
  if (input === undefined) return undefined;
  else return mapValueAndError(input, mapping);
}

export function mapValueAndError<T1, T2>(
  input: ValueAndError<T1>,
  mapping: (v: T1) => T2
) {
  const ret = {} as ValueAndError<T2>;
  if (input.value !== undefined) ret.value = mapping(input.value);
  if (input.error !== undefined) ret.error = mapping(input.error);
  return ret;
}
