import { MiLogger } from './log';

/** This is a pool of workers, it executes given
 * promises in order with a maximum of concurrent
 * promises defined by @param concurrency.
 *
 * Slightly modified version of
 * https://github.com/rxaviers/async-pool/blob/1.x/lib/es7.js */
export async function asyncPool<T, R>(
  concurrency: number,
  iterable: Iterable<T>,
  iteratorFn: (_: T) => Promise<R>
): Promise<R[]> {
  const results = [];
  const executing = new Set();
  const errs: Array<Error>[] = [];

  for (const item of iterable) {
    const pr = Promise.resolve().then(() => iteratorFn(item));
    results.push(pr);
    executing.add(pr);

    pr.catch((e) => { errs.push(e) })
      .finally(() => executing.delete(pr));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  const result = await Promise.all(results);
  if (errs.length > 0) {
    throw new AsyncPoolError('Errors while executing async pool: ' + errs);
  }

  return result;
}

export class AsyncPoolError extends Error {}
