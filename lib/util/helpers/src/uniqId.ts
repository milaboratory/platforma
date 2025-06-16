export function createGetIncrementalId() {
  let idx = 0n;
  return () => idx++;
}
