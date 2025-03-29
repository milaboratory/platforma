/** The argument for iterableFn so it could control async pool from inside. */
export type AsyncPoolController = {
  setConcurrency: (n: number) => void;
};

/** This is a pool of workers, it executes given
 * promises in order with a maximum of concurrent
 * promises defined by @param concurrency.
 * The concurrency can be changed from inside
 * via [`AsyncPoolController.setConcurrency`].
 *
 * Slightly modified version of
 * https://github.com/rxaviers/async-pool/blob/1.x/lib/es7.js */
export async function asyncPool(
  initConcurrency: number,
  iterableFns: ((c: AsyncPoolController) => Promise<void>)[],
): Promise<void> {
  let concurrency = initConcurrency;
  const controller: AsyncPoolController = {
    setConcurrency: (n) => concurrency = n,
  };

  const results = [];
  const executing = new Set();
  const errs: Array<Error>[] = [];

  for (const fn of iterableFns) {
    if (errs.length > 0) throw new AsyncPoolError(`Errors while executing async pool: ${errs.map((e) => e instanceof Error ? e.message : String(e)).join(', ')}`);

    const p = fn(controller);
    results.push(p);
    executing.add(p);

    p.catch((e) => {
      errs.push(e);
    }).finally(() => executing.delete(p));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(results);
  if (errs.length > 0) {
    throw new AsyncPoolError(`Errors while executing async pool: ${errs.map((e) => e instanceof Error ? e.message : String(e)).join(', ')}`);
  }
}

export class AsyncPoolError extends Error {}
