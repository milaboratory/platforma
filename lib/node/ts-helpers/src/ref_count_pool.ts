import { isAsyncDisposable, isDisposable } from './obj';

/**
 * Function associated with particular entry from the RefCountResourcePool.
 *
 * Calling the function will release the reference acquired when object was
 * retieved from the pool.
 */
export type UnrefFn = () => void;

export interface PollResource<R> {
  /** Resource itself */
  readonly resource: R;

  /** Resource key, calculated using provided  */
  readonly key: string;

  /** Callback to be called when requested resource can be disposed. */
  readonly unref: UnrefFn;
}

export abstract class RefCountResourcePool<P, R> {
  private readonly resources = new Map<string, RefCountEnvelop<R>>();
  private readonly disposeQueue = Promise.resolve();
  protected abstract createNewResource(params: P): R;
  protected abstract calculateParamsKey(params: P): string;

  private check(key: string) {
    const envelop = this.resources.get(key);
    if (envelop === undefined) throw new Error('Unexpected state.');
    if (envelop.refCount === 0) {
      this.resources.delete(key);
      const resource = envelop.resource;

      if (isDisposable(resource)) {
        const _ = this.disposeQueue.then(() => resource[Symbol.dispose]());
      } else if (isAsyncDisposable(resource)) {
        const _ = this.disposeQueue.then(() => resource[Symbol.asyncDispose]());
      }
    }
  }

  public acquire(params: P): PollResource<R> {
    const key = this.calculateParamsKey(params);
    let envelop = this.resources.get(key);
    if (envelop === undefined) {
      envelop = { refCount: 0, resource: this.createNewResource(params) };
      this.resources.set(key, envelop);
    }

    // adding ref count
    envelop.refCount++;

    let unrefereced = false;
    return {
      resource: envelop.resource,
      key,
      unref: () => {
        if (unrefereced) return; // unref is idempotent, calling it many times have no effect
        // subtracting ref count
        envelop.refCount--;
        unrefereced = true;
        this.check(key);
      },
    };
  }

  public getByKey(key: string): R {
    const envelop = this.resources.get(key);
    if (envelop === undefined) throw new Error(`resource not found, key = ${key}`);
    return envelop.resource;
  }

  public tryGetByKey(key: string): R | undefined {
    return this.resources.get(key)?.resource;
  }
}

type RefCountEnvelop<R> = {
  refCount: number;
  readonly resource: R;
};
