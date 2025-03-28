export function assertNever(x: never): never {
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  throw new Error('Unexpected object: ' + x); // This is ok, because this is a possible runtime error
}
