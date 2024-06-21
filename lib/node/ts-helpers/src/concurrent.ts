/** This is a pool of workers, it executes given
 * promises in order with a maximum of concurrent
 * promises defined by @param concurrency.
 *
 * Slightly modified version of
 * https://github.com/rxaviers/async-pool/blob/1.x/lib/es7.js */
export async function asyncPool(
  concurrency: number,
  iterableFns: Promise<void>[]
): Promise<void> {
  const results = [];
  const executing = new Set();
  const errs: Array<Error>[] = [];

  for (const fn of iterableFns) {
    results.push(fn);
    executing.add(fn);

    fn.catch((e) => {
      errs.push(e);
    })
      .finally(() => executing.delete(fn));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(results);
  if (errs.length > 0) {
    throw new AsyncPoolError('Errors while executing async pool: ' + errs);
  }
}

export class AsyncPoolError extends Error {
}
