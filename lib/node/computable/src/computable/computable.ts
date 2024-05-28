import {
  ComputableKernel,
  WrappedComputableKernel, WrappedKernelField
} from './kernel';
import { CellState, createCellState, updateCellState } from './computable_state';
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

// TODO ComputableListener pattern is limited to only track events of the
//      root computable, not allowing to track interactions with derived states,
//      if computable in question is used as "nested computable". If this becomes
//      an issue in the future, it is easy to push this pattern to the level of
//      watchers, and harnessing watcher's hierarchy to spread "listeners" from
//      nested to parent watchers and thus computables.

/** Allows to listen for user interaction events after computable is created */
export interface ComputableListener {
  onChangedRequest(instance: Computable<unknown>): void;

  getValue(instance: Computable<unknown>): void;

  onListenStart(instance: Computable<unknown>): void;

  onListenStop(instance: Computable<unknown>): void;
}

export class Computable<T> implements WrappedComputableKernel<T> {
  private stateCalculation?: Promise<void>;
  private state?: CellState<T>;
  private uTag: string = '';
  public readonly [WrappedKernelField]: ComputableKernel<T>;

  constructor(kernel: ComputableKernel<T>,
              private readonly listener?: ComputableListener) {
    this[WrappedKernelField] = kernel;
  }

  private _changed(uTag?: string): boolean {
    return this.state === undefined
      || this.state.watcher.isChanged
      || (uTag !== undefined && this.uTag !== uTag);
  }

  /** @deprecated use {@link isChanged} instead */
  public get changed(): boolean {
    return this.isChanged();
  }

  public isChanged(uTag?: string): boolean {
    // reporting to listener if it is set
    this.listener?.onChangedRequest(this);

    return this._changed(uTag);
  }

  /** Used if listener is attached to this computable instance to report only clean
   * "listening status" change events. */
  private listenCounter = 0;

  public async listen(abortSignal?: AbortSignal, uTag?: string): Promise<void> {
    if (this._changed(uTag)) {
      // this counts as "changed flag" polling
      this.listener?.onChangedRequest(this);

      // reporting "changed" immediately
      return;
    }

    const lPromise = this.state!.watcher.listen(abortSignal);
    if (this.listener !== undefined) {
      if (this.listenCounter === 0)
        this.listener.onListenStart(this);
      this.listenCounter++;
      try {
        return await lPromise;
      } finally {
        if (--this.listenCounter === 0)
          this.listener!.onListenStop(this);
      }
    } else {
      return await lPromise;
    }
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
    // notifying the listener
    this.listener?.getValue(this);

    if (this.stateCalculation !== undefined) {

      // waiting for stat to update in case update was triggered elsewhere
      await this.stateCalculation;

    } else if (this.state === undefined || this.state.watcher.isChanged) {

      // starting async state update
      this.stateCalculation = (async () => {
        this.state = this.state === undefined
          ? await createCellState(this[WrappedKernelField])
          : await updateCellState(this.state);
        // updating uTag as we just assigned new state
        this.uTag = randomUUID();
        // we are done updating state
        this.stateCalculation = undefined;
      })();

      // and now waiting for it to finish
      await this.stateCalculation;

    }

    const state = notEmpty(this.state);

    if (state.allErrors.length === 0)
      return { type: 'ok', value: state.value as T, stable: state.stable, uTag: this.uTag };
    else
      return { type: 'error', errors: state.allErrors, uTag: this.uTag };
  }
}
