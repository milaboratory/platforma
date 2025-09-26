export function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x); // This is ok, because this is a possible runtime error
}

/**
 * Return unique entries of the array by the provided id
 * For each id, the last entry is kept
 */
export function uniqueBy<T>(array: T[], makeId: (entry: T) => string): T[] {
  return [...new Map(array.map((e) => [makeId(e), e])).values()];
}
