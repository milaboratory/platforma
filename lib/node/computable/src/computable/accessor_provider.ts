import { Watcher } from '../watcher';
import { ComputableCtx } from './kernel';

/** Signals that accessor was used outside the scope of computable
 * kernel lambda. */
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

//
// Utils
//

export type ExtractTrackedAccessorTypes<T> = {
  [K in keyof T]: T[K] extends TrackedAccessorProvider<infer I> ? I : never;
};

/**
 * From { a: provider1, b: provider2 } returns provider that constructs
 * accessors of form { a: accessor1, b: accessor2 }, where corresponding
 * accessors are produced by corresponding providers.
 * */
export function combineProviders<PP>(providers: PP): TrackedAccessorProvider<ExtractTrackedAccessorTypes<PP>> {
  return {
    createInstance(watcher: Watcher, guard: UsageGuard, ctx: ComputableCtx): ExtractTrackedAccessorTypes<PP> {
      const result: Record<string, unknown> = {};
      for (const key in providers) {
        const drv = providers[key];
        if (
          !!drv &&
          typeof drv === 'object' &&
          'createInstance' in drv &&
          typeof drv['createInstance'] === 'function'
        )
          result[key] = (drv as TrackedAccessorProvider<unknown>)
            .createInstance(watcher, guard, ctx);
      }
      return result as unknown as ExtractTrackedAccessorTypes<PP>;
    }
  };
}
