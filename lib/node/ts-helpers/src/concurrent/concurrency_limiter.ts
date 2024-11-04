import Denque from 'denque';

/** Unbound async queue */
export class ConcurrencyLimitingExecutor {
  private readonly lockReleases = new Denque<() => void>();

  constructor(private readonly concurrencyLimit: number) {}

  private async awaitSlot(): Promise<void> {
    await new Promise<void>((resolve) => this.lockReleases.push(resolve));
  }

  private releaseSlot() {
    const release = this.lockReleases.shift();
    if (release !== undefined) release();
  }

  private runningTasks = 0;

  public async run<T>(task: () => Promise<T>): Promise<T> {
    while (this.runningTasks === this.concurrencyLimit) await this.awaitSlot();
    if (this.runningTasks >= this.concurrencyLimit)
      throw new Error(
        `runningTasks >= limit; ${this.runningTasks} >= ${this.concurrencyLimit} (queue: ${this.lockReleases.length})`
      );
    this.runningTasks++;
    try {
      return await task();
    } finally {
      this.runningTasks--;
      this.releaseSlot();
    }
  }
}
