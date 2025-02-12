/** We give a factory func to this thing, and
 * it will call the factory each time we reset it. */
export class RetryablePromise<T> {
  // The promise if the value is being created.
  private promise: Promise<T> | null = null;

  /**
   * @param factory A callback that creates a Promise<T> (for example, an SSH connection).
   */
  constructor(private readonly factory: (p: RetryablePromise<T>) => Promise<T>) {}

  /**
   * Ensures that the promise is created and returns it.
   * If the value has already been created, it returns a resolved promise with that value.
   * If a promise is already in flight, it returns that promise.
   * Otherwise, it calls the factory to create a new promise.
   */
  public ensure(): Promise<T> {
    if (this.promise) {
      return this.promise;
    }

    return this.promise = this.factory(this);
  }

  /**
   * Resets the cached value so that the next call to ensure() will create a new one.
   */
  public reset(): void {
    this.promise = null;
  }
}
