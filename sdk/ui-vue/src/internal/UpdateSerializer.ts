import { delay } from '@milaboratories/helpers';
import { hasAbortError } from '@platforma-sdk/model';

export type RetryState = {
  i: number;
};

export type OnNext = (e: unknown, state: RetryState) => { delayMs: number };

export class UpdateSerializer {
  private ongoingRun: Promise<boolean> = Promise.resolve(false);
  private ongoingOperation: Promise<void> = Promise.resolve();
  private counter = 0;

  constructor(private readonly options: {
    debounceSpan?: number;
  } = {}) {}

  async allSettled(): Promise<void> {
    let completed = false;
    do {
      completed = await this.ongoingRun;
    } while (!completed);
  }

  async retry<T>(
    op: () => Promise<T>,
    onNext: OnNext,
  ): Promise<T> {
    const state: RetryState = {
      i: 0,
    };

    while (true) {
      try {
        state.i++;
        return await op();
      } catch (e: unknown) {
        const { delayMs } = onNext(e, state);

        if (hasAbortError(e)) {
          throw e;
        }

        await delay(delayMs);
      }
    }
  }

  /**
   * @returns true if operation succeeded, or false if operation was evicted by a more recent call
   */
  public async run(op: () => Promise<void>): Promise<boolean> {
    return this.ongoingRun = this._run(op);
  }

  /**
   * @returns true if operation succeeded, or false if operation was evicted by a more recent call
   */
  private async _run(op: () => Promise<void>): Promise<boolean> {
    // assigning a sequential update id to the call
    this.counter++;
    const myId = this.counter;

    if (this.options.debounceSpan) {
      await delay(this.options.debounceSpan);
    }

    // checking that this update is still the most recent
    if (this.counter !== myId)
    // operation was canceled, because another operation was queued
    // after we started waiting for previous operation to finish
      return false;

    // awaiting previous operation to finish
    try {
      await this.ongoingOperation;
    } catch (_err: unknown) {
      // ignoring the error here, original caller will receive any rejections
    }

    // checking that this update is still the most recent
    if (this.counter !== myId)
      // operation was canceled, because another operation was queued
      // after we started waiting for previous operation to finish
      return false;

    // asynchronously starting the operation
    const opPromise = this.retry(() => op(), (e) => {
      console.warn('UpdateSerializer.run error, retrying...', e);
      return {
        delayMs: 100, // TODO: flexible delay
      };
    });
    // publishing the promise for the next operation to await
    this.ongoingOperation = opPromise;
    // actually awaiting for the operation result, any rejections will be thrown here
    await opPromise;

    // operation was successfully called
    return true;
  }
}
