import { Computable } from './computable';
import { ComputableHooks } from './computable_hooks';

export type StartStopComputableHooksOps = {
  /** How long to wait after last computable request to send stopUpdating
   * request to the data source. */
  stopDebounce: number
};

/** Allows to simplify linkage of computable state request events (i.e. signs
 * that somebody is interested in its value) to the processes keeping the
 * underlying state fresh, like periodically polling pl. */
export class PollingComputableHooks implements ComputableHooks {
  private readonly stopDebounce: number;

  private sourceActivated = false;

  constructor(private readonly startUpdating: () => void,
              private readonly stopUpdating: () => void,
              ops: StartStopComputableHooksOps,
              private readonly scheduleOnNextFreshState?: (resolve: () => void, reject: (error: any) => void) => void) {
    this.stopDebounce = ops.stopDebounce;
  }

  private stopCountdown: NodeJS.Timeout | undefined;

  private scheduleStopIfNeeded(): void {
    if (this.sourceActivated
      && this.listening.size === 0
      && this.awaitingRefresh.size === 0
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

  onGetValue(instance: Computable<unknown>): void {
    // the same a onChangeRequest
    this.onChangedRequest();
  }

  private readonly awaitingRefresh = new Set<symbol>();

  refreshState(): Promise<void> {
    if (this.scheduleOnNextFreshState === undefined)
      return Promise.resolve();

    const uniqueSymbol = Symbol();
    const result = new Promise<void>((resolve, reject) =>
      this.scheduleOnNextFreshState!(
        () => {
          this.awaitingRefresh.delete(uniqueSymbol);
          this.scheduleStopIfNeeded();
          resolve();
        },
        (err) => {
          this.awaitingRefresh.delete(uniqueSymbol);
          this.scheduleStopIfNeeded();
          reject(err);
        }
      ));
    this.awaitingRefresh.add(uniqueSymbol);
    this.startIfNeeded();
    return result;
  }

  private readonly listening = new Set<Computable<unknown>>();

  onListenStart(instance: Computable<unknown>): void {
    this.listening.add(instance);
    this.startIfNeeded();
  }

  onListenStop(instance: Computable<unknown>): void {
    this.listening.delete(instance);
    this.scheduleStopIfNeeded();
  }
}
