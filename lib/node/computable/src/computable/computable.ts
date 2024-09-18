import {
  CellRenderingOps,
  ComputableCtx,
  ComputableKernel,
  ComputablePostProcess,
  ComputableRecoverAction,
  IntermediateRenderingResult,
  UnwrapComputables
} from './kernel';
import {
  CellState,
  createCellState,
  createCellStateWithoutValue,
  destroyState,
  updateCellState,
  updateCellStateWithoutValue
} from './computable_state';
import { notEmpty } from '@milaboratories/ts-helpers';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { formatError } from './error';

/** Represents the most general result of the computable, successful or error */
export type ComputableResult<T> = ComputableResultErrors | ComputableResultOk<T>;

/** Interface for an erroneous result from a computable */
export interface ComputableResultErrors {
  /** Discriminator for the type of result */
  type: 'error';

  /**
   * All errors of the composed computable.
   *
   * Because computable is a composable object that may contain multiple
   * nested computables, which in tern may have their own nested computables,
   * and their values are calculated semantically in parallel, there are
   * multiple points where errors may occur. This field aggregate all the
   * errors happened along the computable trees, and were not recovered by the
   * kernel's recovery method.
   * */
  errors: unknown[];

  /** UTag of this result, to be able to check whether the result have
   * changed after some time, and start actively listen on the next change. */
  uTag: string;
}

/** Interface for a successful result from a computable */
export interface ComputableResultOk<T> {
  /** Discriminator for the type of result */
  type: 'ok';

  /** The fully rendered result after all processing stages */
  value: T;

  /** Unique tag of this result to monitor changes over time and listen for the next change */
  uTag: string;

  /**
   * Indicates the stability of the result.
   *
   * The stability can vary based on the type of computable. For example:
   * - A file content computable might return "undefined" until fully downloaded, marking it as unstable.
   * - A computable waiting for a non-existent field might return an incomplete result as unstable.
   *
   * A result is considered stable only if all its nested computables are stable.
   */
  stable: boolean;

  /** First encountered unstable markers, specified when this or nested computable was marked as unstable. */
  unstableMarker: string | undefined;
}

/** Throws an appropriate computable error based on the number of errors */
function throwComputableError(errors: unknown[]): never {
  if (errors.length === 1) throw new ComputableError(errors[0]);
  else throw new AggregateComputableError(errors);
}

/** Represents any computable error, single or multiple */
export type AnyComputableError = ComputableError | AggregateComputableError;

/** Error class for a single error encountered during computable calculation */
export class ComputableError extends Error {
  constructor(public readonly cause: any) {
    super(`Computable error: ${cause.message}`, { cause });
  }
}

/** Error class for multiple errors encountered simultaneously during computable calculation */
export class AggregateComputableError extends AggregateError {
  constructor(public readonly errors: any[]) {
    super(errors, `Computable error: ${errors.map((e) => e.message).join(' ; ')}`);
  }
}

/** Type returned by computables that wraps errors */
export type ComputableValueOrErrors<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[]; moreErrors: boolean };

export interface ComputableRenderingOps extends CellRenderingOps {
  /**
   * Key allows computable to correlate same computable instances across multiple
   * incarnations of computable tree. This in turn, allows to preserve computable
   * context state for nested computables, and implement caching behaviour for
   * retentive computables (see {@link CellRenderingMode}).
   * */
  key: string | symbol;

  // /**
  //  * By default, computable will pre-calculate value tree by executing given
  //  * kernel callback upon its construction. If this flag is set to true, the
  //  * computable will be lazy, and first invocation of the kernel will be done
  //  * only on first getValue or similar method call.
  //  * */
  // lazyInitialization: boolean;
}

const DefaultRenderingOps: CellRenderingOps = {
  mode: 'Live',
  resetValueOnError: true
};

/** This runs state cleanup logic */
// TODO TBD
const computableFinalizationRegistry = new FinalizationRegistry<Computable<unknown>>((c) =>
  c.resetState()
);

export type ComputableStableDefined<T> = Computable<T | undefined, T>;

/**
 * Class representing a reactive value that changes over time and
 * propagates updates to dependents automatically.
 *
 * A computable value is akin to the result of a pure function executed on
 * changing underlying data, potentially from external systems. Interactions
 * with this object can influence external system synchronization to keep
 * the result up-to-date, especially if the computable value is frequently
 * accessed or monitored.
 *
 * The `Computable` class manages dynamically changing values and provides
 * mechanisms to observe these changes reactively. It supports both
 * synchronous and asynchronous operations, along with a post-processing
 * step to finalize the computed values.
 *
 * @template T The type of the computed value.
 * @template StableT A refined type representing the stable state of the value.
 */
export class Computable<T, StableT extends T = T> {
  /** Tracks the state reset epochs */
  private epoch = 0;

  private stateCalculation?: Promise<void>;

  /** Current state of the computable */
  private state?: CellState<T>;

  private uTag: string = '';

  private readonly ___wrapped_kernel___: ComputableKernel<T>;

  /** Better use dedicated factory methods. */
  constructor(kernel: ComputableKernel<T>) {
    this.___wrapped_kernel___ = kernel;
  }

  private _changed(uTag?: string): boolean {
    return (
      this.state === undefined ||
      this.state.watcher.isChanged ||
      this.state.valueNotCalculated ||
      (uTag !== undefined && this.uTag !== uTag)
    );
  }

  /** This is a noop helper method to add stable type to the
   * computable type signature. */
  public withStableType<ST extends T = Exclude<T, undefined>>(): Computable<T, ST> {
    return this as any as Computable<T, ST>;
  }

  /** @deprecated use {@link isChanged} instead */
  public get changed(): boolean {
    return this.isChanged();
  }

  /** This method allows to create read-after-write semantics for the values
   * returned by the computable. This method sends refresh request to all underlying
   * data sources, and awaits successful refresh procedure execution, so after
   * the promise returned by this method resolves, value returned by getValue methods
   * is guaranteed to be based on the underlying data that is up-to-date to the
   * moment this method was entered. */
  public async refreshState(): Promise<void> {
    const hooks = this.state?.hooks;
    if (hooks === undefined) return;
    const promises: Promise<void>[] = [];
    for (const h of hooks) promises.push(h.refreshState(this));
    if (promises.length === 0) return;
    await Promise.all(promises);
  }

  /**
   * Checks if one of the underlying data sources is marked as changed and
   * value recalculation is required.
   *
   * @param uTag optional tag to compare the current state
   * @returns true if the state has changed; otherwise, false.
   */
  public isChanged(uTag?: string): boolean {
    // reporting to observers
    const hooks = this.state?.hooks;
    if (hooks !== undefined) for (const h of hooks) h.onChangedRequest(this);

    return this._changed(uTag);
  }

  /** Used if listener is attached to this computable instance to report only clean
   * "listening status" change events. */
  private listenCounter = 0;

  /** @deprecated use {@link awaitChange} */
  public async listen(abortSignal?: AbortSignal, uTag?: string): Promise<void> {
    return await this.awaitChange(abortSignal, uTag);
  }

  /**
   * Waits for the value to be marked as changed after the last value retrieval.
   * Resolves immediately if the value is already changed.
   *
   * It's important to call `getValue` within any loop using `listen`
   * to prevent useless busy loops.
   *
   * uTag parameter can be used to listen for the change of a specific known value,
   * as returned by {@link getFullValue} or {@link getValueOrError}.
   *
   * While pending listen operation is active, all source data providers will be notified
   * about this fact, and will continue polling or listening for the underlying remote
   * state, to keep the data fresh.
   *
   * @param abortSignal optional signal to abort the pending listening.
   * @param uTag optional tag to check if a new value is calculated after retrieval of a specified tag.
   * */
  public async awaitChange(abortSignal?: AbortSignal, uTag?: string): Promise<void> {
    if (this._changed(uTag)) {
      // this counts as "changed flag" polling
      const hooks = this.state?.hooks;
      if (hooks !== undefined) for (const h of hooks) h.onChangedRequest(this);

      await setImmediate(undefined, { signal: abortSignal });

      // reporting "changed" immediately
      return;
    }

    const lPromise = this.state!.watcher.awaitChange(abortSignal);
    const hooks = this.state?.hooks;
    if (hooks !== undefined) {
      if (this.listenCounter === 0) for (const h of hooks) h.onListenStart(this);
      this.listenCounter++;
      try {
        return await lPromise;
      } finally {
        if (--this.listenCounter === 0) for (const h of hooks) h.onListenStop(this);
      }
    } else {
      return await lPromise;
    }
  }

  /**
   * Waits for the next stable state and returns the fully stable result.
   * Similar behavior to {@link getFullValue}.
   *
   * @param abortSignal Optional signal to abort the pending operation.
   */
  public async awaitStableFullValue(
    abortSignal?: AbortSignal
  ): Promise<ComputableResultOk<StableT>> {
    while (true) {
      const value = await this.getFullValue();
      if (value.stable) return value as ComputableResultOk<StableT>;
      await this.awaitChange(abortSignal);
    }
  }

  /**
   * Waits for the next stable state and returns the stable value.
   * Similar behavior to {@link getValue}.
   *
   * @param abortSignal Optional signal to abort the pending operation.
   */
  public async awaitStableValue(abortSignal?: AbortSignal): Promise<StableT> {
    return (await this.awaitStableFullValue(abortSignal)).value;
  }

  /**
   * Recalculates (if required) current value based on the data available at the
   * moment, and returns it. Asynchronous nature of this method comes from optional
   * asynchronous post-processing steps. Core part of the value is calculated
   * synchronously at the moment of execution of this method.
   *
   * @returns a Promise resolving to the stable computed value, of rejected if
   *          error(s) happened during computable calculation
   */
  public async getValue(): Promise<T> {
    const result = await this.getValueOrError();
    if (result.type === 'error') throwComputableError(result.errors);
    return result.value;
  }

  /**
   * The same as {@link getValue} but also returns internal state information,
   * such as uTag and stability. Errors are thrown as promise rejections.
   * */
  public async getFullValue(): Promise<ComputableResultOk<T>> {
    const result = await this.getValueOrError();
    if (result.type === 'error') throwComputableError(result.errors);
    return result;
  }

  /**
   * Internally creates value tree, but don't execute async post-processing
   * state.
   * */
  private _preCalculateValueTree(): this {
    if (this.stateCalculation !== undefined) throw new Error('Illegal state for pre-calculation.');
    this.state =
      this.state === undefined
        ? createCellStateWithoutValue(this.___wrapped_kernel___)
        : updateCellStateWithoutValue(this.state);

    // calling this method is equivalent to value request
    if (this.state.hooks !== undefined)
      for (const hooks of this.state.hooks) hooks.onGetValue(this);

    return this;
  }

  /**
   * Creates a copy of this computable with pre-calculated value tree state,
   * without execution of async post-processing steps.
   * */
  public withPreCalculatedValueTree(): Computable<T, StableT> {
    return new Computable<T, StableT>(this.___wrapped_kernel___)._preCalculateValueTree();
  }

  /** @deprecated */
  public preCalculateValueTree(): Computable<T, StableT> {
    return this.withPreCalculatedValueTree();
  }

  /**
   * The same as {@link getValue} but gets raw computable value. This method
   * will not return rejected promise in case computable was executed with error.
   * Error result in {@link ComputableResultErrors} object returned by this method.
   * */
  public async getValueOrError(): Promise<ComputableResult<T>> {
    // to check that epoch is still ours when we finish updating the state
    const ourEpoch = this.epoch;

    if (this.stateCalculation !== undefined) {
      // waiting for stat to update in case update was triggered elsewhere
      await this.stateCalculation;
    } else if (
      this.state === undefined ||
      this.state.watcher.isChanged ||
      this.state.valueNotCalculated
    ) {
      // starting async state update
      this.stateCalculation = (async () => {
        try {
          // awaiting new state
          const newState =
            this.state === undefined
              ? await createCellState(this.___wrapped_kernel___)
              : await updateCellState(this.state);

          // check that reset state didn't happen
          if (this.epoch !== ourEpoch) {
            // all those efforts were for nothing
            destroyState(newState);
            return;
          }

          // important state assertion
          if (this.listenCounter !== 0) throw new Error('Concurrent listening and state update.');

          // updating the state
          this.state = newState;

          // updating uTag as we just assigned new state
          this.uTag = randomUUID();
        } finally {
          if (this.epoch === ourEpoch)
            // we are done updating state
            this.stateCalculation = undefined;
        }
      })();

      // and now waiting for it to finish
      await this.stateCalculation;
    }

    if (this.epoch !== ourEpoch)
      throw new Error('Somebody reset the state while we were recalculating');

    const state = notEmpty(this.state);

    // reporting to observers
    if (state.hooks !== undefined) for (const hooks of state.hooks) hooks.onGetValue(this);

    if (state.allErrors.length === 0)
      return {
        type: 'ok',
        value: state.value as T,
        stable: state.stable,
        uTag: this.uTag,
        unstableMarker: state.unstableMarker
      };
    else return { type: 'error', errors: state.allErrors, uTag: this.uTag };
  }

  /**
   * Resets the state of this computable to its initial state, triggering all
   * onDestroy callbacks down the state tree.
   */
  public resetState(): void {
    if (this.state === undefined && this.stateCalculation === undefined) return;
    if (this.stateCalculation !== undefined) {
      this.stateCalculation = undefined;
      // no need to destroy current state, state updater will do it for us
      // when discover that epoch changed
    } else if (this.state !== undefined) {
      destroyState(this.state);
    }
    this.state = undefined;
    this.epoch++;
    this.uTag = '';
  }

  private static ephKeyCounter = 1;

  private static nextEphemeralKey(): string {
    return `__ephkey_${Computable.ephKeyCounter++}`;
  }

  /**
   * Simplest way to create computable specifying only main callback. Nested
   * computables can be returned by the callback and will be automatically
   * computed by the computable state machine.
   *
   * @param cb main computable callback
   * @returns the computable instance
   * */
  public static make<IR>(cb: (ctx: ComputableCtx) => IR): Computable<UnwrapComputables<IR>>;

  /**
   * Creates a computable with post-processing and recover actions,
   * and additional rendering options. This constructor allows recovery and
   * post-processing and rendering configuration.
   *
   * @param cb main computable callback
   * @param ops post-processing, recovery actions, and rendering options
   * @returns the computable instance
   */
  public static make<IR, T>(
    cb: (ctx: ComputableCtx) => IR,
    ops: ComputablePostProcess<UnwrapComputables<IR>, T> &
      ComputableRecoverAction<T> &
      Partial<ComputableRenderingOps>
  ): Computable<T>;

  /**
   * Creates a computable with recover actions and additional rendering options.
   * Allows specifying custom recovery and rendering configurations without a
   * specific post-processing.
   *
   * @param cb main computable callback
   * @param ops recovery actions and rendering options
   * @returns the computable instance
   */
  public static make<IR, T>(
    cb: (ctx: ComputableCtx) => IR,
    ops: ComputableRecoverAction<T> & Partial<ComputableRenderingOps>
  ): Computable<UnwrapComputables<IR> | T>;

  /**
   * Creates a computable with post-processing and rendering options. This allows
   * the configuration of additional options necessary for computation without
   * specific action for recovery.
   *
   * @param cb main computable callback
   * @param ops Post-processing actions and rendering options
   * @returns the computable instance
   */
  public static make<IR, T>(
    cb: (ctx: ComputableCtx) => IR,
    ops: ComputablePostProcess<IR, T> & Partial<ComputableRenderingOps>
  ): Computable<T>;

  /**
   * Creates a computable with just rendering options. This constructor allows
   * specifying custom rendering configurations without recovery or post-processing.
   *
   * @param cb main computable callback
   * @param ops rendering options
   * @returns the computable instance
   */
  public static make<IR>(
    cb: (ctx: ComputableCtx) => IR,
    ops: Partial<ComputableRenderingOps>
  ): Computable<UnwrapComputables<IR>>;

  /**
   * Recommended way to construct a computable instance. Post-processing and
   * error recovery behaviour as well as rendering options and computable key
   * can be set via the ops argument.
   *
   * For advanced usage, where capturing of main callback environment in post-process
   * lambda is required, main constructor can still be used.
   *
   * @param cb main computable callback
   * @param ops post-processing, recovery, computable key and rendering options
   *            can be set via this parameter
   * @returns the computable instance
   * */
  public static make<IR, T = UnwrapComputables<IR>>(
    cb: (ctx: ComputableCtx) => IR,
    ops?: Partial<ComputablePostProcess<IR, T>> &
      Partial<ComputableRecoverAction<T>> &
      Partial<ComputableRenderingOps>
  ): Computable<T> {
    return Computable.makeRaw((ctx) => {
      let ir: IR;
      if (ops?.recover !== undefined) {
        // here we also catch main callback errors, and passes any errors to
        // the recovery lambda, raw kernel definition can't give this behaviour
        // without manual error handling in the code
        try {
          ir = cb(ctx);
        } catch (err: unknown) {
          return {
            // this might in tern throw an error, which will be caught by the
            // computable state machine
            ir: ops.recover([err]) as any
          };
        }
      } else ir = cb(ctx);
      return {
        ir,
        postprocessValue: ops?.postprocessValue as (
          value: unknown,
          stable: boolean
        ) => Promise<T> | T,
        recover: ops?.recover
      };
    }, ops);
  }

  public static makeRaw<IR, T>(
    cb: (ctx: ComputableCtx) => IntermediateRenderingResult<IR, T>,
    ops?: Partial<ComputableRenderingOps>
  ): Computable<T> {
    // adding in defaults and creating final ops for the kernel
    const { mode, resetValueOnError } = ops ?? {};
    const renderingOps: CellRenderingOps = {
      ...DefaultRenderingOps,
      ...(mode !== undefined && { mode }),
      ...(resetValueOnError !== undefined && { resetValueOnError })
    };

    // creating computable instance
    return new Computable<T>({
      ops: renderingOps,
      key: ops?.key ?? Computable.nextEphemeralKey(),
      ___kernel___: cb
    });
  }

  /** Wraps a computable catching all errors, formatting them as string and returning as error-or-value structure. */
  public static wrapError<T>(
    computable: Computable<T>,
    maxErrors: number = 1
  ): Computable<ComputableValueOrErrors<T>> {
    return Computable.make(() => computable, {
      postprocessValue: (value) => ({ ok: true, value: value as T }) as ComputableValueOrErrors<T>,
      recover: (error: unknown[]) => {
        const formattedErrors: string[] = [];
        for (let i = 0; i < Math.min(maxErrors, error.length); i++)
          formattedErrors.push(formatError(error[i]));
        return {
          ok: false,
          errors: formattedErrors,
          moreErrors: error.length > maxErrors
        } as ComputableValueOrErrors<T>;
      }
    });
  }
}
