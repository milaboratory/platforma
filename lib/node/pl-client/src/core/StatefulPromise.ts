type PromiseState = 'pending' | 'fulfilled' | 'rejected';

type StatefulPromiseOptions<T> = {
  /**
   * If true, rejections that happen inside the promise are *recorded* but
   * not rethrown from the constructor chain. They will only surface when you
   * call unwrap()/then()/await.
   */
  deferReject?: true;
  /**
   * Callback invoked when the promise is accessed (via then/catch/finally/await).
   * Useful for cleanup or tracking when a promise result is consumed.
   */
  onUnwrap?: (promise: StatefulPromise<T>) => void;
};

/**
 * A Promise wrapper that tracks its state (pending/fulfilled/rejected) and provides
 * optional deferred rejection handling to prevent unhandled promise rejections.
 */
export class StatefulPromise<T> implements Promise<T> {
  private _state: PromiseState;
  private _id: bigint;

  private static idCounter = 0n;

  public static debug = false;

  static from<T>(promise: Promise<T>, options: StatefulPromiseOptions<T> = {}): StatefulPromise<T> {
    return new StatefulPromise(promise, options);
  }

  static fromDeferredReject<T>(promise: Promise<T>, onUnwrap?: (promise: StatefulPromise<T>) => void): StatefulPromise<T> {
    return new StatefulPromise(promise, { deferReject: true, onUnwrap });
  }

  static fromDeferredRejectCallback<T>(asyncFn: () => Promise<T>, onUnwrap?: (promise: StatefulPromise<T>) => void): StatefulPromise<T> {
    return new StatefulPromise(asyncFn(), { deferReject: true, onUnwrap });
  }

  private constructor(private readonly promise: Promise<T>, private readonly options: StatefulPromiseOptions<T> = {}) {
    this._state = 'pending';
    this._id = StatefulPromise.idCounter++;

    this.promise
      .then((value) => {
        this._state = 'fulfilled';
        return value;
      })
      .catch((err) => {
        this._state = 'rejected';
        if (!options.deferReject) {
          throw err;
        }
      });
  }

  readonly [Symbol.toStringTag] = 'Promise';

  get id(): bigint {
    return this._id;
  }

  get state(): PromiseState {
    return this._state;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.unwrap().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: (reason: unknown) => TResult | PromiseLike<TResult>,
  ): Promise<T | TResult> {
    return this.unwrap().catch(onrejected);
  }

  finally(onfinally?: () => void): Promise<T> {
    return this.unwrap().finally(onfinally);
  }

  async unwrap(): Promise<T> {
    if (this.options.onUnwrap) {
      this.options.onUnwrap(this);
    }

    return this.promise;
  }
}
