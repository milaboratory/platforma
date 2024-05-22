import {
  ComputableKernel,
  WrappedComputableKernel, WrappedKernelField
} from './kernel';
import { CellState, createCellState, updateCellState } from './computable_state';
import { notEmpty } from '@milaboratory/ts-helpers';

export type ComputableResult<T> = ComputableResultErrors | ComputableResultOk<T>;

export interface ComputableResultErrors {
  type: 'error';
  errors: any[];
}

export interface ComputableResultOk<T> {
  type: 'ok';
  value: T;
  stable: boolean;
}

export class ComputableError extends AggregateError {
  constructor(public readonly errors: any[]) {
    super(errors);
  }
}

export class Computable<T> implements WrappedComputableKernel<T> {
  private stateCalculation?: Promise<void>;
  private state?: CellState<T>;
  public readonly [WrappedKernelField]: ComputableKernel<T>;

  constructor(kernel: ComputableKernel<T>) {
    this[WrappedKernelField] = kernel;
  }

  get changed(): boolean {
    return this.state === undefined || this.state.watcher.isChanged;
  }

  async listen(): Promise<void> {
    if (this.state === undefined)
      return;
    await this.state.watcher.listen();
  }

  async getValue(): Promise<T> {
    const result = await this.getValueOrError();
    if (result.type === 'error')
      throw new ComputableError(result.errors);
    return result.value;
  }

  async getValueOrError(): Promise<ComputableResult<T>> {
    if (this.stateCalculation !== undefined) {
      await this.stateCalculation;
    } else if (this.state === undefined || this.state.watcher.isChanged) {
      this.stateCalculation = (async () => {
        this.state = this.state === undefined
          ? await createCellState(this[WrappedKernelField])
          : await updateCellState(this.state);
        this.stateCalculation = undefined;
      })();
      await this.stateCalculation;
    }

    const state = notEmpty(this.state);
    if (state.allErrors.length === 0)
      return { type: 'ok', value: state.value as T, stable: state.stable };
    else
      return { type: 'error', errors: state.allErrors };
  }
}
