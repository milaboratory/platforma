type PromiseState = 'pending' | 'fulfilled' | 'rejected';

type StatefulPromiseOptions = {
  /**
   * If true, rejections that happen inside the promise are *recorded* but
   * not rethrown from the constructor chain. They will only surface when you
   * call unwrap()/then()/await.
   */
  deferReject?: true;
};

export class StatefulPromise<T> implements Promise<T> {
  #promise: Promise<T>;
  #state: PromiseState;
  #value?: T;
  #reason?: unknown;

  static from<T>(promise: Promise<T>, options: StatefulPromiseOptions = {}): StatefulPromise<T> {
    return new StatefulPromise(promise, options);
  }

  static fromDeferredReject<T>(promise: Promise<T>): StatefulPromise<T> {
    return new StatefulPromise(promise, { deferReject: true });
  }

  static fromDeferredRejectCallback<T>(asyncFn: () => Promise<T>): StatefulPromise<T> {
    return new StatefulPromise(asyncFn(), { deferReject: true });
  }

  private constructor(promise: Promise<T>, options: StatefulPromiseOptions = {}) {
    this.#promise = promise;
    this.#state = 'pending';

    promise
      .then((value) => {
        this.#state = 'fulfilled';
        this.#value = value;
        return value;
      })
      .catch((err) => {
        this.#state = 'rejected';
        this.#reason = err;
        if (!options.deferReject) {
          throw err;
        }
      });
  }

  readonly [Symbol.toStringTag] = 'Promise';

  get state(): PromiseState {
    return this.#state;
  }

  get value(): T | undefined {
    return this.#value;
  }

  get reason(): unknown {
    return this.#reason;
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
    if (this.#state === 'fulfilled') {
      return this.#value!;
    }

    if (this.#state === 'rejected') {
      throw this.#reason;
    }

    return this.#promise;
  }
}
