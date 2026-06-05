import Denque from "denque";

/**
 * FIFO async queue that admits at most `concurrencyLimit` tasks at once.
 *
 * The unit of accounting is a *slot*, held from the moment a task is admitted until
 * `run` settles. At most `concurrencyLimit` slots are ever held.
 *
 * Cancellation (when a task is given a signal) acts on the slot, not on the task body:
 * - a task already cancelled when `run` is called rejects without taking a turn;
 * - a task cancelled while queued bails at admission, without running its body;
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
    signal?.throwIfAborted(); // already cancelled: reject without taking a turn in the queue
    // A slot freed below may be claimed by a task admitted in the meantime, so re-test
    // the limit after every wake-up before taking the slot — this is what bounds
    // `runningTasks` at `concurrencyLimit`.
    while (this.runningTasks >= this.concurrencyLimit)
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.runningTasks++;
    try {
      signal?.throwIfAborted(); // cancelled while queued: give up the slot at admission
      if (signal === undefined) return await task();

      let removeAbortListener = () => {};
      const aborted = new Promise<never>((_, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      });
      try {
        // Race so the slot is released on abort even if `task` ignores its signal and runs
        // on detached. A late settle from the loser is consumed by `Promise.race`'s own
        // reaction, so it never surfaces as an unhandled rejection.
        return await Promise.race([task(), aborted]);
      } finally {
        // When `task` wins, `aborted` is left pending forever; drop the listener so it does
        // not retain its closure (and `task`) on a long-lived signal.
        removeAbortListener();
      }
    } finally {
      this.runningTasks--;
      this.waiters.shift()?.(); // hand the freed slot to the next waiter, if any
    }
  }
}
