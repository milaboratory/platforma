export function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x); // This is ok, because this is a possible runtime error
}
