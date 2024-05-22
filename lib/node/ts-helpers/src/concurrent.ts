import { sleep } from "./temporal";
import { MiLogger } from './log';

/** Runs worker Promises one by one with different data
 * and can be closed. */
export class Queue<T> {
  private readonly items: Array<T> = [];
  private working: boolean = false;

  constructor(
    private closePoolingMs: number = 100,
    private logger: MiLogger,
    private worker: (data: T) => Promise<void>
  ) {}

  public add(data: T) {
    this.items.push(data);
    this.runNext();
  }

  private async runNext() {
    if (this.working) return;
    if (this.items.length === 0) return;
    const data = this.items.shift();
    if (data == undefined) return;

    this.working = true;
    try {
      await this.worker(data);
    } catch (e) {
      this.logger.error('queue worker: ' + e);
    }
    this.working = false;

    this.runNext();
  }

  public async closeAndWait() {
    this.items.length = 0; // drop all tasks.
    while (this.working) {
      await sleep(this.closePoolingMs);
    }
  }
}

/** This is a pool of workers, it executes given
 * promises in order with a maximum of concurrent
 * promises defined by @param concurrency.
 *
 * Slightly modified version of
 * https://github.com/rxaviers/async-pool/blob/1.x/lib/es7.js */
export async function asyncPool<T, R>(
  logger: MiLogger,
  concurrency: number,
  iterable: Iterable<T>,
  iteratorFn: (_: T) => Promise<R>
): Promise<R[]> {
  const ret = [];
  const executing = new Set();
  const errs: Array<Error>[] = [];

  for (const item of iterable) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.catch((e) => {
      logger.error('asyncPool fn: ' + e);
      errs.push(e);
    }).finally(clean);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  const result = await Promise.all(ret);
  if (errs.length > 0) {
    throw new AsyncPoolError('Errors while executing async pool: ' + errs);
  }

  return result;
}

export class AsyncPoolError extends Error {}
