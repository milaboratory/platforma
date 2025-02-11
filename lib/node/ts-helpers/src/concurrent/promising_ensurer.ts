/** We give a factory func to this thing, and
 * it will return a Promise or the thing
 * when we create*/
export class EnsurePromise<T> {
  // The cached value once the promise is fulfilled.
  private cachedValue: T | null = null;
  // The in‑flight promise if the value is being created.
  private inFlightPromise: Promise<T> | null = null;

  /**
   * @param factory A callback that creates a Promise<T> (for example, an SSH connection).
   */
  constructor(private readonly factory: (p: EnsurePromise<T>) => Promise<T>) {}

  /**
   * Ensures that the promise is created and returns it.
   * If the value has already been created, it returns a resolved promise with that value.
   * If a promise is already in flight, it returns that promise.
   * Otherwise, it calls the factory to create a new promise.
   */
  public ensure(): Promise<T> {
    if (this.cachedValue) {
      return Promise.resolve(this.cachedValue);
    }
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = this.factory(this)
      .then((result: T) => {
        this.cachedValue = result;
        this.inFlightPromise = null;
        return result;
      })
      .catch((err) => {
        this.inFlightPromise = null;
        throw err;
      });

    return this.inFlightPromise;
  }

  /**
   * Resets the cached value so that the next call to ensure() will create a new one.
   */
  public reset(): void {
    this.cachedValue = null;
  }
}
