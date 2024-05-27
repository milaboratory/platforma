import { Computable, ComputableListener } from './computable';
import { TrackedAccessorProvider } from './accessor_provider';
import { ComputableCtx, UnwrapComputables } from './kernel';
import { ComputableRenderingOps, computable } from './computable_helpers';
import { Omit } from 'utility-types';

export interface ComputableDataSource<A> {
  /** Returns accessor factory to facilitate creation of new computables */
  accessorFactory: TrackedAccessorProvider<A>;

  /** Should start update process */
  startUpdating(): void;

  /** Should terminate update process */
  stopUpdating(): void;
}

export type ComputableReactorOps = {
  /** How long to wait after last computable request to send stopUpdating
   * request to the data source. */
  stopDebounce: number
};

export class ComputableReactor<A> implements ComputableListener {
  private sourceActive = false;
  private readonly stopDebounce: number;

  constructor(private readonly source: ComputableDataSource<A>, ops: ComputableReactorOps) {
    this.stopDebounce = ops.stopDebounce;
  }

  private stopCountdown: NodeJS.Timeout | undefined;

  private scheduleStopIfNeeded(): void {
    if (this.sourceActive && this.listening.size === 0
      && this.stopCountdown === undefined)
      this.stopCountdown = setTimeout(() => {
        this.source.stopUpdating();
        this.sourceActive = false;
        this.stopCountdown = undefined;
      }, this.stopDebounce);
  }

  private startIfNeeded(): void {
    if (this.sourceActive) {
      if (this.stopCountdown !== undefined) {
        clearTimeout(this.stopCountdown);
        this.stopCountdown = undefined;
      }
      return;
    } else {
      this.source.startUpdating();
      this.sourceActive = true;
    }
  }

  onChangedRequest(): void {
    this.startIfNeeded();
    // reschedule if needed
    this.scheduleStopIfNeeded();
  }

  private listening = new Set<Computable<unknown>>();

  onListenStart(instance: Computable<unknown>): void {
    this.listening.add(instance);
    this.startIfNeeded();
  }

  onListenStop(instance: Computable<unknown>): void {
    this.listening.delete(instance);
    this.scheduleStopIfNeeded();
  }

  getValue(instance: Computable<unknown>): void {
    // the same a onChangeRequest
    this.onChangedRequest();
  }

  computable<IR, T = UnwrapComputables<IR>>(
    ops: Omit<Partial<ComputableRenderingOps>, 'listener'> = {},
    cb: (a: A, ctx: ComputableCtx) => IR,
    postprocessValue?: (value: UnwrapComputables<IR>, stable: boolean) => Promise<T>): Computable<T> {
    return computable(this.source.accessorFactory, { ...ops, listener: this }, cb, postprocessValue);
  }
}
