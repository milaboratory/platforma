import Denque from "denque";

/**
 * FIFO async queue that admits at most `concurrencyLimit` tasks at once.
 *
 * The unit of accounting is a *slot*, held from the moment a task is admitted until
 * `run` settles. At most `concurrencyLimit` slots are ever held.
 *
 * Cancellation (when a task is given a signal) acts on the slot, not on the task body:
 * - a task cancelled before or while queued gives up its slot the moment it is admitted,
 *   without running its body;
 * - a task cancelled while running settles `run` and releases the slot immediately, even
 *   if the body ignores the signal and keeps running.
 *
 * The second case is the trade-off that keeps a stuck operation from wedging the queue
 * permanently: the abandoned body runs to completion detached (retaining its continuation
 * until it settles), so a body that does not honour its signal can briefly overlap newly
 * admitted work. Pass a signal only where a detached body is acceptable (e.g. its remaining
 * work is cheap or self-cancelling); omit it to keep a strict "never more than N bodies
 * running" guarantee.
 */
export class ConcurrencyLimitingExecutor {
  private readonly waiters = new Denque<() => void>();
  private runningTasks = 0;

  constructor(private readonly concurrencyLimit: number) {}

  public async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    // A slot freed below may be claimed by a task admitted in the meantime, so re-test
    // the limit after every wake-up before taking the slot — this is what bounds
    // `runningTasks` at `concurrencyLimit`.
    while (this.runningTasks >= this.concurrencyLimit)
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.runningTasks++;
    try {
      signal?.throwIfAborted(); // cancelled before/while queued: give up the slot at once
      if (signal === undefined) return await task();

      const aborted = new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
      // Once `task` wins the race nothing awaits `aborted`; this catch keeps a later abort
      // from surfacing as an unhandled rejection.
      aborted.catch(() => {});
      return await Promise.race([task(), aborted]);
    } finally {
      this.runningTasks--;
      this.waiters.shift()?.(); // hand the freed slot to the next waiter, if any
    }
  }
}
