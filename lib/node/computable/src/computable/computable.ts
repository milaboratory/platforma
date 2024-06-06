import { ComputableKernel, WrappedComputableKernel, WrappedKernelField } from './kernel';
import { CellState, createCellState, destroyState, updateCellState } from './computable_state';
import { notEmpty } from '@milaboratory/ts-helpers';
import { randomUUID } from 'node:crypto';

export type ComputableResult<T> = ComputableResultErrors | ComputableResultOk<T>;

export interface ComputableResultErrors {
  type: 'error';
  errors: any[];
  uTag: string;
}

export interface ComputableResultOk<T> {
  type: 'ok';
  value: T;
  stable: boolean;
  uTag: string;
}

function throwComputableError(errors: any[]): never {
  if (errors.length === 1)
    throw new ComputableError(errors[0]);
  else
    throw new AggregateComputableError(errors);
}

export type AnyComputableError = ComputableError | AggregateComputableError;

export class ComputableError extends Error {
  constructor(public readonly cause: any) {
    super(`Computable error: ${cause.message}`, { cause });
  }
}

export class AggregateComputableError extends AggregateError {
  constructor(public readonly errors: any[]) {
    super(errors, `Computable error: ${errors.map(e => e.message).join(' ; ')}`);
  }
}

/** This runs state cleanup logic */
// TODO TBD
const computableFinalizationRegistry = new FinalizationRegistry<Computable<unknown>>(
  c =>
    c.resetState());

export type ComputableSU<T> = Computable<T | undefined, T>;

export class Computable<T, StableT extends T = T> implements WrappedComputableKernel<T> {
  /** Updated on each state reset */
  private epoch = 0;
  private stateCalculation?: Promise<void>;
  private state?: CellState<T>;
  private uTag: string = '';
  public readonly [WrappedKernelField]: ComputableKernel<T>;

  constructor(kernel: ComputableKernel<T>) {
    this[WrappedKernelField] = kernel;
  }

  private _changed(uTag?: string): boolean {
    return this.state === undefined
      || this.state.watcher.isChanged
      || (uTag !== undefined && this.uTag !== uTag);
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

  public async refreshState(): Promise<void> {
    const hooks = this.state?.hooks;
    if (hooks === undefined)
      return;
    const promises: Promise<void>[] = [];
    for (const h of hooks)
      promises.push(h.refreshState(this));
    if (promises.length === 0)
      return;
    await Promise.all(promises);
  }

  public isChanged(uTag?: string): boolean {
    // reporting to observers
    const hooks = this.state?.hooks;
    if (hooks !== undefined)
      for (const h of hooks)
        h.onChangedRequest(this);

    return this._changed(uTag);
  }

  /** Used if listener is attached to this computable instance to report only clean
   * "listening status" change events. */
  private listenCounter = 0;

  public async listen(abortSignal?: AbortSignal, uTag?: string): Promise<void> {
    if (this._changed(uTag)) {
      // this counts as "changed flag" polling
      const hooks = this.state?.hooks;
      if (hooks !== undefined)
        for (const h of hooks)
          h.onChangedRequest(this);

      // reporting "changed" immediately
      return;
    }

    const lPromise = this.state!.watcher.listen(abortSignal);
    const hooks = this.state?.hooks;
    if (hooks !== undefined) {
      if (this.listenCounter === 0)
        for (const h of hooks)
          h.onListenStart(this);
      this.listenCounter++;
      try {
        return await lPromise;
      } finally {
        if (--this.listenCounter === 0)
          for (const h of hooks)
            h.onListenStop(this);
      }
    } else {
      return await lPromise;
    }
  }

  public async awaitStableFullValue(abortSignal?: AbortSignal): Promise<ComputableResultOk<StableT>> {
    while (true) {
      const value = await this.getFullValue();
      if (value.stable)
        return value as ComputableResultOk<StableT>;
      await this.listen(abortSignal);
    }
  }

  public async awaitStableValue(abortSignal?: AbortSignal): Promise<StableT> {
    return (await this.awaitStableFullValue(abortSignal)).value;
  }

  public async getValue(): Promise<T> {
    const result = await this.getValueOrError();
    if (result.type === 'error')
      throwComputableError(result.errors);
    return result.value;
  }

  public async getFullValue(): Promise<ComputableResultOk<T>> {
    const result = await this.getValueOrError();
    if (result.type === 'error')
      throwComputableError(result.errors);
    return result;
  }

  public async getValueOrError(): Promise<ComputableResult<T>> {
    // to check that epoch is still ours when we finish updating the state
    const ourEpoch = this.epoch;

    if (this.stateCalculation !== undefined) {

      // waiting for stat to update in case update was triggered elsewhere
      await this.stateCalculation;

    } else if (this.state === undefined || this.state.watcher.isChanged) {

      // starting async state update
      this.stateCalculation = (async () => {
        try {
          // awaiting new state
          const newState = this.state === undefined
            ? await createCellState(this[WrappedKernelField])
            : await updateCellState(this.state);

          // check that reset state didn't happen
          if (this.epoch !== ourEpoch) {
            // all those efforts were for nothing
            destroyState(newState);
            return;
          }

          // important state assertion
          if (this.listenCounter !== 0)
            throw new Error('Concurrent listening and state update.');

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
    if (state.hooks !== undefined)
      for (const hooks of state.hooks)
        hooks.onGetValue(this);

    if (state.allErrors.length === 0)
      return { type: 'ok', value: state.value as T, stable: state.stable, uTag: this.uTag };
    else
      return { type: 'error', errors: state.allErrors, uTag: this.uTag };
  }

  /** This will trigger all onDestroys down the state tree, and reset the
   * state of this computable to initial. */
  public resetState(): void {
    if (this.state === undefined && this.stateCalculation === undefined)
      return;
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
}
