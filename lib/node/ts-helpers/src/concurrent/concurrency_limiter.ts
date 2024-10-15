import Denque from "denque";

/** Unbound async queue */
export class ConcurrencyLimitingExecutor {
    private readonly lockReleases = new Denque<() => void>();
  
    constructor(private readonly concurrencyLimit: number) {}
  
    private async awaitSlot() {
      await new Promise<void>((resolve) => this.lockReleases.push(resolve));
    }
  
    private async releaseSlot() {
      const release = this.lockReleases.shift();
      if (release !== undefined) release();
    }
  
    private runningTasks = 0;
  
    public async run<T>(task: () => Promise<T>): Promise<T> {
      if (this.runningTasks === this.concurrencyLimit) await this.awaitSlot();
      if (this.runningTasks >= this.concurrencyLimit) throw new Error('Unexpected state');
      this.runningTasks++;
      try {
        return await task();
      } finally {
        this.runningTasks--;
        this.releaseSlot();
      }
    }
  }
  