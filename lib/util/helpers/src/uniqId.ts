let idx = 0n;

export function getIncrementalIdx(): bigint {
  return idx++;
}

export function getIncrementalId(): string {
  return getIncrementalIdx().toString();
}