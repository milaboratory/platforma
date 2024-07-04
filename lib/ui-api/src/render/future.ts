import { FutureAwait, FutureHandle } from './internal';
import { registerFutureAwait } from '../internal';

export class FutureRef<T = unknown> {
  private isResolved = false;
  private resolvedValue?: T;

  constructor(private readonly handle: FutureHandle,
              private readonly postProcess: (value: unknown) => T = (v) => v as T) {
    registerFutureAwait(handle, (value) => {
      this.resolvedValue = postProcess(value);
      this.isResolved = true;
    });
  }

  public map<R>(mapping: (v: T) => R): FutureRef<R> {
    return new FutureRef<R>(this.handle,
      v => mapping(this.postProcess(v)));
  }

  public mapDefined<R>(mapping: (v: NonNullable<T>) => R): FutureRef<R | undefined> {
    return new FutureRef<R | undefined>(this.handle,
      v => {
        const vv = this.postProcess(v);
        return vv ? mapping(vv) : undefined;
      });
  }

  toJSON(): any {
    return this.isResolved
      ? this.resolvedValue
      : { __awaited_futures__: [this.handle] } as FutureAwait;
  }
}

export type ExtractFutureRefType<Ref extends FutureRef> =
  Ref extends FutureRef<infer T>
    ? T
    : never;
