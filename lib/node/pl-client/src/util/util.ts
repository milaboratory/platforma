export function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x);
}

export function notEmpty<T>(v: T | null | undefined, message?: string): T {
  if (v === null || v === undefined) {
    throw Error(message ?? 'Variable is not defined');
  }

  return v;
}

export async function tryExecute<R>(
  cb: () => Promise<R>,
  onError: (e: unknown) => Promise<boolean>
): Promise<R> {
  let repeat = true;

  while (repeat) {
    try {
      return await cb();
    } catch (e) {
      repeat = await onError(e);
      if (!repeat) {
        throw e;
      }
    }
  }

  throw Error('unreachable');
}
