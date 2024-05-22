import { AsyncQueue } from './async_queue';

export class TaskProcessor<T> {
  readonly queue = new AsyncQueue<T>();
  readonly workers: Promise<void>[];
  continue: boolean = true;

  constructor(numberOfWorkers: number,
              private readonly processor: (obj: T) => Promise<void>,
              private readonly recoverableErrorPredicate: (error: any) => boolean) {
    this.workers = [];
    for (let i = 0; i < numberOfWorkers; i++)
      this.workers.push(this.worker());
  }

  public push(obj: T): void {
    this.queue.push(obj);
  }

  public stop(){
    this.continue = false;
  }

  public async await(): Promise<void> {
    await Promise.all(this.workers);
  }

  private async worker(): Promise<void> {
    while (this.continue) {
      const obj = await this.queue.shift();
      try {
        await this.processor(obj);
      } catch (e: any) {
        if (this.recoverableErrorPredicate(e))
          this.queue.push(obj);
      }
    }
  }
}
