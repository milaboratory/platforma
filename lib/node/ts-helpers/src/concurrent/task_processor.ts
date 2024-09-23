import { MiLogger } from '../log';
import {
  ExponentialWithMaxBackoffDelayRetryOptions,
  InfiniteRetryOptions,
  LinearBackoffRetryOptions,
  RetryOptions,
  createInfiniteRetryState,
  createRetryState,
  nextInfiniteRetryState,
  nextRetryStateOrError,
  tryNextRetryState
} from '../temporal';
import { AsyncQueue } from './async_queue';
import { scheduler } from 'node:timers/promises';

export interface Task {
  readonly fn: () => Promise<void>;
  readonly recoverableErrorPredicate: (error: any) => boolean;
}

/** It is a queue of tasks that are executed by N workers.
 * N is defined in constructor.
 * If the task has a recoverable error, the task will be repeated. */
export class TaskProcessor {
  readonly queue = new AsyncQueue<Task>();
  readonly workers: Promise<void>[];
  keepRunning: boolean = true;

  private readonly backoffOptionsPerWorker: InfiniteRetryOptions;

  constructor(
    private readonly logger: MiLogger,
    numberOfWorkers: number,
    /** The task will be tried infinitely. */
    backoffOptions: ExponentialWithMaxBackoffDelayRetryOptions = {
      type: 'exponentialWithMaxDelayBackoff',
      initialDelay: 1,
      maxDelay: 15000, // 15 seconds
      backoffMultiplier: 1.5,
      jitter: 0.5
    }
  ) {
    this.backoffOptionsPerWorker = backoffOptions;
    this.backoffOptionsPerWorker.maxDelay *= numberOfWorkers;

    this.workers = [];
    for (let i = 0; i < numberOfWorkers; i++) this.workers.push(this.worker(String(i)));
  }

  public push(task: Task): void {
    this.queue.push(task);
  }

  public stop() {
    this.keepRunning = false;
  }

  /** TODO: we need to implement AbortSignal on queue.shift, shift and
   * this method creates a deadlock. */
  public async await(): Promise<void> {
    await Promise.all(this.workers);
  }

  /** Gets a task and sleeps if the task throws a recoverable error. */
  private async worker(id: string): Promise<void> {
    let retry = createInfiniteRetryState(this.backoffOptionsPerWorker);

    while (this.keepRunning) {
      const task = await this.queue.shift();

      try {
        await task.fn();
        retry = createInfiniteRetryState(this.backoffOptionsPerWorker);
      } catch (e: any) {
        if (task.recoverableErrorPredicate(e)) {
          this.logger.warn(
            `recoverable error in a task processor: ${String(e)},` +
              ` worker ${id} will wait for ${retry.nextDelay} ms.`
          );
          this.queue.push(task);
          retry = nextInfiniteRetryState(retry);
          await scheduler.wait(retry.nextDelay);

          continue;
        }
        this.logger.warn(
          `non-recoverable error in a task processor, the task will be dropped: ${String(e)}`
        );
      }
    }
  }
}
