import {
  ComputableCtx, PollingComputableHooks,
  TrackedAccessorProvider,
  UsageGuard,
  Watcher
} from '@milaboratory/computable';
import { PlTreeEntry, PlTreeEntryAccessor } from './accessors';
import { PlClient, ResourceId } from '@milaboratory/pl-client-v2';
import { FinalPredicate, PlTreeState } from './state';
import { constructTreeLoadingRequest, loadTreeState, PruningFunction } from './sync';
import { sleep } from '@milaboratory/ts-helpers';

export type TreeDataSourceOps = {
  finalPredicate?: FinalPredicate,
  pruning?: PruningFunction,

  /** Interval after last sync to sleep before the next one */
  pollingInterval: number;
  /** For how long to continue polling after the last derived value access */
  stopPollingDelay: number;
}

export class SynchronizedTreeState {
  private readonly state: PlTreeState;
  private readonly pollingInterval: number;
  private readonly pruning?: PruningFunction;
  private readonly hooks: PollingComputableHooks;

  constructor(private readonly pl: PlClient,
              private readonly root: ResourceId,
              ops: TreeDataSourceOps) {
    const { finalPredicate, pruning, pollingInterval, stopPollingDelay } = ops;
    this.pruning = pruning;
    this.pollingInterval = pollingInterval;
    this.state = new PlTreeState(root, finalPredicate);
    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(),
      () => this.stopUpdating(),
      { stopDebounce: stopPollingDelay },
      (res) => this.scheduleOnNextState(res)
    );
  }

  public accessor(rid: ResourceId = this.root): PlTreeEntry {
    return new PlTreeEntry(this.state, this.root, this.hooks);
  }

  private scheduledOnNextState: (() => void)[] = [];

  private scheduleOnNextState(res: () => void): void {
    this.scheduledOnNextState.push(res);
  }

  /** Called from observer */
  private startUpdating(): void {
    this.keepRunning = true;
    if (this.currentLoop === undefined)
      this.currentLoop = this.mainLoop();
  }

  /** Called from observer */
  private stopUpdating(): void {
    this.keepRunning = false;
  }

  /** If true, main loop will continue polling pl state. */
  private keepRunning = false;
  /** Actual state of main loop. */
  private currentLoop: Promise<void> | undefined = undefined;

  private async mainLoop() {
    while (true) {

      // saving those who want to be notified about new state here
      // because those who will be added during the tree retrieval
      // should be notified only on the next round
      let toNotify: (() => void)[] | undefined = undefined;
      if (this.scheduledOnNextState.length > 0) {
        toNotify = this.scheduledOnNextState;
        this.scheduledOnNextState = [];
      }

      try {

        const request = constructTreeLoadingRequest(this.state, this.pruning);
        const data = await this.pl.withReadTx('ReadingTree', async tx => {
          return await loadTreeState(tx, request);
        });
        this.state.updateFromResourceData(data, true);

        // notifying that we got new state
        if (toNotify !== undefined) {
          for (const res of toNotify)
            res();
          // to prevent rescheduling in finally
          toNotify = undefined;
        }

      } catch (e: any) {
        console.error(e);
      } finally {
        // rescheduling, if we were not able to pull the state
        if (toNotify !== undefined)
          this.scheduledOnNextState.push(...toNotify);
      }

      if (!this.keepRunning)
        break;
      await sleep(this.pollingInterval);
      if (!this.keepRunning)
        break;

    }
    this.currentLoop = undefined;
  }
}
