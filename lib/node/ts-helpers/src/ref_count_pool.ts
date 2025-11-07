import { isAsyncDisposable, isDisposable } from './obj';

/**
 * Function associated with particular entry from the RefCountResourcePool.
 *
 * Calling the function will release the reference acquired when object was
 * retieved from the pool.
 */
export type UnrefFn = () => void;

export interface PoolEntry<R extends {} = {}, K extends string = string> extends Disposable {
  /** Resource itself created by `createNewResource` function */
  readonly resource: R;

  /** Resource key, calculated using provided `calculateParamsKey` function */
  readonly key: K;

  /** Callback to be called when requested resource can be disposed. */
  readonly unref: UnrefFn;
}

type RefCountEnvelope<R> = {
  refCount: number;
  readonly resource: R;
};

export interface RefCountPool<P, R extends {}, K extends string = string> {
  /** Acquire resource from the pool */
  acquire(params: P): PoolEntry<R, K>;

  /** Try to get a resource by key */
  tryGetByKey(key: K): R | undefined;

  /** Get a resource by key */
  getByKey(key: K): R;
}

export abstract class RefCountPoolBase<P, R extends {}, K extends string = string>
implements RefCountPool<P, R, K> {
  private readonly resources = new Map<K, RefCountEnvelope<R>>();
  private readonly disposeQueue = Promise.resolve();

  private check(key: K) {
    const envelope = this.resources.get(key);
    if (envelope === undefined) throw new Error('Unexpected state.');
    if (envelope.refCount === 0) {
      this.resources.delete(key);
      const resource = envelope.resource;

      if (isDisposable(resource)) {
        void this.disposeQueue.then(() => resource[Symbol.dispose]());
      } else if (isAsyncDisposable(resource)) {
        void this.disposeQueue.then(() => resource[Symbol.asyncDispose]());
      }
    }
  }

  protected abstract calculateParamsKey(params: P): K;
  protected abstract createNewResource(params: P, key: K): R;

  public acquire(params: P): PoolEntry<R, K> {
    const key = this.calculateParamsKey(params);
    let envelope = this.resources.get(key);
    if (envelope === undefined) {
      envelope = { refCount: 0, resource: this.createNewResource(params, key) };
      this.resources.set(key, envelope);
    }

    // adding ref count
    envelope.refCount++;

    let unreferenced = false;
    const unref = () => {
      if (unreferenced) return; // unref is idempotent, calling it many times have no effect
      unreferenced = true;
      // subtracting ref count
      envelope.refCount--;
      this.check(key);
    };
    return {
      resource: envelope.resource,
      key,
      unref,
      [Symbol.dispose]: unref,
    };
  }

  public tryGetByKey(key: K): R | undefined {
    return this.resources.get(key)?.resource;
  }

  public abstract getByKey(key: K): R;
}
