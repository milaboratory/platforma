import Denque from 'denque';

/** Unbound async queue */
export class AsyncQueue<T> {
  private readonly queue = new Denque<T>();
  private readonly lockReleases = new Denque<() => void>();

  private async awaitNotEmpty() {
    await new Promise<void>(resolve => this.lockReleases.push(resolve));
  }

  public push(obj: T): void {
    this.queue.push(obj);
    const release = this.lockReleases.shift();
    if (release !== undefined)
      release();
  }

  public async shift(): Promise<T> {
    while (true) {
      const obj = this.queue.shift();
      if (obj !== undefined)
        return obj;
      await this.awaitNotEmpty();
    }
  }
}
