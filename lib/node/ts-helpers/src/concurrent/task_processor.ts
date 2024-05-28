import { RetryOptions as BackoffOptions, createRetryState, nextRetryStateOrError, tryNextRetryState } from '../temporal';
import { AsyncQueue } from './async_queue';

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
  continue: boolean = true;

  constructor(
    numberOfWorkers: number,
    /** Every worker has its own retry state.
     * The consequence is that a task will be tried
     * (N workers * N attempts) times. */
    private readonly backoffOptionsPerWorker: BackoffOptions = {
      type: 'linearBackoff',
      maxAttempts: 10,
      initialDelay: 2, // 2ms
      backoffStep: 20,
      jitter: 0.1 // 10%
    },
  ) {
    this.workers = [];
    for (let i = 0; i < numberOfWorkers; i++)
      this.workers.push(this.worker());
  }

  public push(task: Task): void {
    this.queue.push(task);
  }

  public stop() {
    this.continue = false;
  }

  /** TODO: we need to implement AbortSignal on queue.shift, shift and
   * this method creates a deadlock. */
  public async await(): Promise<void> {
    await Promise.all(this.workers);
  }

  /** Gets a task and sleeps if the task throws a recoverable error. */
  private async worker(): Promise<void> {
    let retry = createRetryState(this.backoffOptionsPerWorker);

    while (this.continue) {
      const task = await this.queue.shift();

      try {
        await task.fn();
        retry = createRetryState(this.backoffOptionsPerWorker);
      } catch (e: any) {
        if (task.recoverableErrorPredicate(e)) {
          const newRetry = tryNextRetryState(retry);
          if (newRetry !== undefined) {
            this.queue.push(task);
            retry = newRetry;
          } else {
            retry = createRetryState(this.backoffOptionsPerWorker);
          }
        }
      }
    }
  }
}
