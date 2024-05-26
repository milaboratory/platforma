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

  constructor(numberOfWorkers: number) {
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

  public async await(): Promise<void> {
    await Promise.all(this.workers);
  }

  private async worker(): Promise<void> {
    while (this.continue) {
      const task = await this.queue.shift();
      try {
        await task.fn();
      } catch (e: any) {
        if (task.recoverableErrorPredicate(e))
          this.queue.push(task);
      }
    }
  }
}
