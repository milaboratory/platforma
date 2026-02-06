import { StatefulPromise } from "./StatefulPromise";

/**
 * Tracks pending promises to ensure they are all awaited before proceeding.
 * Useful for coordinating async operations, preventing premature completion,
 * and avoiding unhandled promise rejections.
 */
export class PromiseTracker {
  private promises: Set<Promise<unknown>> = new Set();
  private _draining = false;

  get draining(): boolean {
    return this._draining;
  }

  get size(): number {
    return this.promises.size;
  }

  track<T>(promiseOrCallback: Promise<T> | (() => Promise<T>)): Promise<T> {
    const _promise =
      typeof promiseOrCallback === "function" ? promiseOrCallback() : promiseOrCallback;

    const promise = StatefulPromise.fromDeferredReject(_promise, (p) => {
      this.promises.delete(p);
    });
    this.promises.add(promise);
    return promise;
  }

  async awaitAll() {
    const toAwait = Array.from(this.promises);
    this._draining = true;
    return await Promise.all(toAwait).finally(() => {
      this._draining = false;
    });
  }
}
