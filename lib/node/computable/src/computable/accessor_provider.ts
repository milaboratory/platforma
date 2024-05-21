import { Watcher } from '../watcher';
import { ComputableCtx } from './kernel';

export class AccessorLeakException extends Error {
  constructor() {
    super('accessor leak detected');
  }
}

/** Accessor should call this lambda each time user interacts with it.
 * {@link AccessorLeakException} exception will be thrown if computable
 * kernel for which it was created already completed. */
export type UsageGuard = () => void;

/** Interface to be implemented by accessor providers, to be used with
 * computable helpers. */
export interface TrackedAccessorProvider<I> {
  createInstance(watcher: Watcher, guard: UsageGuard, ctx: ComputableCtx): I;
}
