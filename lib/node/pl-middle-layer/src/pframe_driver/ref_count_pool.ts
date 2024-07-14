// export type RefCountResourcePoolFactory = ()
type RefCountEnvelop<R> = {
  refCount: number;
  readonly resource: R;
};

export interface PollResource<R> {
  /** Resource itself */
  readonly resource: R;

  /** Callback to be called when requested resource can be disposed. */
  readonly unref: () => void;
}

export abstract class RefCountResourcePool<P, R extends Disposable> {
  private readonly resources = new Map<string, RefCountEnvelop<R>>();
  protected abstract createNewResource(params: P): R;
  protected abstract calculateParamsKey(params: P): string;

  private check(key: string) {
    const envelop = this.resources.get(key);
    if (envelop === undefined) throw new Error('Unexpected state.');
    if (envelop.refCount === 0) {
      this.resources.delete(key);
      // TODO: we can postpone this operation, and run it in the background
      envelop.resource[Symbol.dispose]();
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
      unref: () => {
        if (unrefereced) return; // unref is idempotent, calling it many times have no effect
        // subtracting ref count
        envelop.refCount--;
        unrefereced = true;
        this.check(key);
      }
    };
  }
}
