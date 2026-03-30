import { isDisposable } from "./obj";

export interface ManualPoolEntry<K extends string = string, R extends {} = {}> {
  /** Resource key, calculated using provided `calculateParamsKey` function */
  readonly key: K;

  /** Resource itself created by `createNewResource` function */
  readonly resource: R;
}

type RefCountEnvelope<R> = {
  refCount: number;
  readonly resource: R;
};

export interface RefCountManualPool<P, K extends string, R extends {}> {
  /** Acquire resource from the pool */
  acquire(params: P): ManualPoolEntry<K, R>;

  /** Try to get a resource by key */
  tryGetByKey(key: K): R | undefined;

  /** Get a resource by key */
  getByKey(key: K): R;

  /** Release resource to the pool */
  release(key: K): void;
}

export abstract class RefCountManualPoolBase<P, K extends string, R extends {}>
  implements RefCountManualPool<P, K, R>, Disposable
{
  private readonly resources = new Map<K, RefCountEnvelope<R>>();

  protected abstract calculateParamsKey(params: P): K;
  protected abstract createNewResource(params: P, key: K): R;

  public acquire(params: P): ManualPoolEntry<K, R> {
    const key = this.calculateParamsKey(params);
    let envelope = this.resources.get(key);
    if (envelope === undefined) {
      envelope = { refCount: 0, resource: this.createNewResource(params, key) };
      this.resources.set(key, envelope);
    }

    // adding ref count
    envelope.refCount++;
    return {
      resource: envelope.resource,
      key,
    };
  }

  public release(key: K): void {
    const envelope = this.resources.get(key);
    if (envelope === undefined) throw new Error(`Key ${key} already disposed`);
    if (--envelope.refCount === 0) {
      this.resources.delete(key);
      const resource = envelope.resource;

      if (isDisposable(resource)) {
        resource[Symbol.dispose]();
      }
    }
  }

  public tryGetByKey(key: K): R | undefined {
    return this.resources.get(key)?.resource;
  }

  public abstract getByKey(key: K): R;

  public dispose(): void {
    for (const resource of this.resources.values()) {
      try {
        if (isDisposable(resource)) {
          resource[Symbol.dispose]();
        }
      } catch {}
    }
  }

  public [Symbol.dispose](): void {
    return this.dispose();
  }
}
