import { Watcher } from '../watcher';
import { ComputableHooks } from './computable_hooks';

export interface ComputableCtx {
  /** Sets timestamp of the data used by accessor. I.e. last time this data was updated. */
  setValidity(timestamp: number): void;

  /** Attaches computable observer to track interactions with resulting computable.
   * Important: try to always inject the same instance of the observer, if it is
   * possible in the context, instance are placed in the Set to keep number of
   * listeners low for a tree. */
  attacheHooks(listener: ComputableHooks): void;

  /** If called during construction, this result will be considered as unstable */
  markUnstable(): void;

  /** Sets a callback to be executed when this computable detaches from current computable tree.
   * If onDestroy callback is already set, context will first schedule execution of that previous callback,
   * and then associate new callback with the context. */
  setOnDestroy(cb: () => void): void;

  /** True if onDestroy callback is set */
  get hasOnDestroy(): boolean;

  /** Executes and resets current onDestroy helper */
  scheduleAndResetOnDestroy(): void;

  /** Get associated value by key */
  get(key: string): any | undefined;

  /** Associate value */
  set(key: string, value: any): void;

  /** Delete associated value */
  reset(key: string): void;

  /** True if there is an associated value */
  has(key: string): boolean;

  /** Associate value */
  getOrCreate<T>(key: string, initializer: () => T): T;
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

/** Returned by a successful execution of rendering function */
export interface IntermediateRenderingResult<IR, T> {
  /** Rendering result, may be absent if rendering result is marked with error. */
  readonly ir: IR;

  /** Will be called to create final representation of the cell value. */
  postprocessValue(value: UnwrapComputables<IR>, stable: boolean): Promise<T>;

  /** Will be called to create final representation of the cell if nested error occur. */
  recover?(error: any[]): T;
}

export const KernelLambdaField: unique symbol = Symbol();
export const WrappedKernelField: unique symbol = Symbol();

/** This object holds minimal information to create a computable instance, while executing
 * hierarchical callbacks all such nodes in the tree are interpreted as computables and
 * rendered accordingly.
 *
 * This object should have no state. THe same kernel can be used to create multiple computables.
 **/
export interface ComputableKernel<T> {
  /** Uniquely identifies this computable. Used to correlate same nested computables
   * between multiple incarnations of intermediate representations. */
  readonly key: string,
  readonly ops: CellRenderingOps,

  /** Computable calculation code. Symbol is use here to facilitate easy identification
   * of computable kernels in arbitrary object trees. */
  [KernelLambdaField](watcher: Watcher, ctx: ComputableCtx): IntermediateRenderingResult<unknown, T>
}

/** I.e. computable. */
export interface WrappedComputableKernel<T> {
  [WrappedKernelField]: ComputableKernel<T>;
}

export function tryExtractComputableKernel(v: any): ComputableKernel<unknown> | undefined {
  if (typeof v === 'object' && v !== null) {
    if (KernelLambdaField in v)
      return v;
    if (WrappedKernelField in v)
      return v[WrappedKernelField];
  }
  return undefined;
}

export type UnwrapComputables<K> = K extends ComputableKernel<infer T>
  ? UnwrapComputables<T>
  : K extends WrappedComputableKernel<infer T>
    ? UnwrapComputables<T>
    : { [key in keyof K]: UnwrapComputables<K[key]> };
