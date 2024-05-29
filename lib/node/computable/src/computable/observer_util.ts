import { Computable } from './computable';
import { ComputableObserver } from './computable_observer';

export type SimpleComputableObserverOps = {
  /** How long to wait after last computable request to send stopUpdating
   * request to the data source. */
  stopDebounce: number
};

/** Allows to simplify linkage of computable state request events (i.e. signs
 * that somebody is interested in its value) to the processes keeping the
 * underlying state fresh, like periodically polling pl. */
export class SimpleComputableObserver implements ComputableObserver {
  private readonly stopDebounce: number;

  private sourceActivated = false;

  constructor(private readonly startUpdating: () => void,
              private readonly stopUpdating: () => void,
              ops: SimpleComputableObserverOps) {
    this.stopDebounce = ops.stopDebounce;
  }

  private stopCountdown: NodeJS.Timeout | undefined;

  private scheduleStopIfNeeded(): void {
    if (this.sourceActivated && this.listening.size === 0
      && this.stopCountdown === undefined)
      this.stopCountdown = setTimeout(() => {
        this.stopUpdating();
        this.sourceActivated = false;
        this.stopCountdown = undefined;
      }, this.stopDebounce);
  }

  private startIfNeeded(): void {
    if (this.sourceActivated) {
      if (this.stopCountdown !== undefined) {
        clearTimeout(this.stopCountdown);
        this.stopCountdown = undefined;
      }
      return;
    } else {
      this.startUpdating();
      this.sourceActivated = true;
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
}
