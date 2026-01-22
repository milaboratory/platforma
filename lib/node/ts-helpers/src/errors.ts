/**
 * Unwraps the error chain, searching for the first error that matches given constructor.
 * Searched error must have 'name' property.
 *
 * @param err - The error to unwrap.
 * @param errorConstructor - The constructor to search for.
 * @param maxDepth - The maximum depth to search.
 *
 * @returns The first error that matches given constructor, or undefined if no error is found within the depth limit.
 */
export function findNamedErrorInCauses<T extends Error>(
  err: unknown,
  errorConstructor: (new (...args: any[]) => T) & { name: string },
  maxDepth: number = 10,
): T | undefined {
  return findNamedErrorInternal(err, errorConstructor, maxDepth);
}

function findNamedErrorInternal<T extends Error>(
  err: unknown,
  errorConstructor: (new (...args: any[]) => T) & { name: string },
  maxDepth: number = 10,
  depth: number = 0,
): T | undefined {
  if (err instanceof errorConstructor) return err;
  if ((err as any)?.name === errorConstructor.name) return err as T;
  if (depth >= maxDepth) return undefined;
  if ((err as any)?.cause) {
    return findNamedErrorInternal((err as any).cause, errorConstructor, maxDepth, depth + 1);
  }
  return undefined;
}
