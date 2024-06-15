import { Watcher } from '../watcher';
import { ComputableHooks } from './computable_hooks';
import { AccessorProvider } from './accessor_provider';
import { Computable } from './computable';

export interface ComputableCtx {
  /** Attaches computable observer to track interactions with resulting computable.
   * Important: try to always inject the same instance of the observer, if it is
   * possible in the context, instance are placed in the Set to keep number of
   * listeners low for a tree. */
  attacheHooks(listener: ComputableHooks): void;

  /** If called during construction, this result will be considered as unstable */
  markUnstable(): void;

  /** Executes and resets current onDestroy helper
   * @deprecated use {@link addOnDestroy} */
  scheduleAndResetOnDestroy(): void;

  /** True if onDestroy callback is set
   * @deprecated use {@link addOnDestroy} */
  get hasOnDestroy(): boolean;

  /** Sets a callback to be executed when this computable detaches from current computable tree.
   * If onDestroy callback is already set, context will first schedule execution of that previous callback,
   * and then associate new callback with the context.
   * @deprecated use {@link addOnDestroy} */
  setOnDestroy(cb: () => void): void;

  /** This callback will be called after generated state is no longer attached to the
   * computable tree, or updated due to the underlying data change. In the latter case
   * all added destructors will be called only after new state is calculated simplifying
   * computable-provider-side logic. */
  addOnDestroy(cb: () => void): void;

  /** Get associated value by key */
  get(key: string): unknown | undefined;

  /** Associate value */
  set(key: string, value: unknown): void;

  /** Delete associated value */
  reset(key: string): void;

  /** True if there is an associated value */
  has(key: string): boolean;

  /** Associate value */
  getOrCreate<T>(key: string, initializer: () => T): T;

  /** Watcher instance. New watcher for each invocation. */
  readonly watcher: Watcher;

  /** Creates accessor, that will be valid for this invocation only. */
  accessor<A>(provider: AccessorProvider<A>): A;
}

export type CellRenderingMode =
/** value will be rendered for any cell state */
  | 'Live'
  /** value will be rendered only when current and all child states reach stable state, any unstable state
   *  will be not rendered, so the value will be  */
  | 'StableOnlyLive'
  /** value will be rendered only when current and all child states reach stable state, during the "unstable" periods
   *  value will retain the latest known rendered value. Unstable errors may reset the value, if corresponding option
   *  is set. */
  | 'StableOnlyRetentive';

export interface CellRenderingOps {
  /** See description for {@link CellRenderingMode}. Default value is 'Live'. */
  mode: CellRenderingMode;
  /** If true, any error in current or child resources will reset the value so the "value" field will be undefined. */
  resetValueOnError: boolean;
}

/** Extended by kernel intermediate returned value, and adds recover method. */
export interface ComputableRecoverAction<T> {
  /** Will be called to create final representation of the cell if nested error occur. */
  recover(error: unknown[]): T;
}

/** Extended by kernel intermediate returned value, and adds postprocess step
 * additionally to recover method. */
export interface ComputablePostProcess<IR, T> {
  /** Will be called to create final representation of the cell value. */
  postprocessValue(value: UnwrapComputables<IR>, stable: boolean): Promise<T> | T;
}

/** Returned by a successful execution of rendering function */
export interface IntermediateRenderingResult<IR, T> extends Partial<ComputableRecoverAction<T>>, Partial<ComputablePostProcess<IR, T>> {
  /** Rendering result, may be absent if rendering result is marked with error. */
  readonly ir: IR;
}

/** This object holds minimal information to create a computable instance, while executing
 * hierarchical callbacks all such nodes in the tree are interpreted as computables and
 * rendered accordingly.
 *
 * This object should have no state. THe same kernel can be used to create multiple computables.
 **/
export interface ComputableKernel<T> {
  /** Uniquely identifies this computable. Used to correlate same nested computables
   * between multiple incarnations of intermediate representations. */
  readonly key: string | symbol,

  /** Controls the rendering process */
  readonly ops: CellRenderingOps,

  /** Computable calculation code. Symbol is use here to facilitate easy identification
   * of computable kernels in arbitrary object trees. */
  ___kernel___(ctx: ComputableCtx): IntermediateRenderingResult<unknown, T>
}

export function tryExtractComputableKernel(v: unknown): ComputableKernel<unknown> | undefined {
  if (typeof v === 'object' && v !== null) {
    if ('___kernel___' in v)
      return v as ComputableKernel<unknown>;
    if ('___wrapped_kernel___' in v)
      return v['___wrapped_kernel___'] as ComputableKernel<unknown>;
  }
  return undefined;
}

export type UnwrapComputables<K> = K extends ComputableKernel<infer T>
  ? UnwrapComputables<T>
  : K extends Computable<infer T>
    ? UnwrapComputables<T>
    : K extends bigint | boolean | null | number | string | symbol | undefined
      ? K
      : { [key in keyof K]: UnwrapComputables<K[key]> }
