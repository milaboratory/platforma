import { PollingComputableHooks } from '@milaboratory/computable';
import { PlTreeEntry } from './accessors';
import { PlClient, ResourceId } from '@milaboratory/pl-client-v2';
import { FinalPredicate, PlTreeState, TreeStateUpdateError } from './state';
import { constructTreeLoadingRequest, loadTreeState, PruningFunction } from './sync';
import { sleep } from '@milaboratory/ts-helpers';

export type SynchronizedTreeOps = {
  finalPredicate?: FinalPredicate,
  pruning?: PruningFunction,

  /** Interval after last sync to sleep before the next one */
  pollingInterval: number;
  /** For how long to continue polling after the last derived value access */
  stopPollingDelay: number;
}

type ScheduledRefresh = {
  resolve: () => void,
  reject: (err: any) => void
}

export class SynchronizedTreeState {
  private readonly finalPredicate: FinalPredicate | undefined;
  private state: PlTreeState;
  private readonly pollingInterval: number;
  private readonly pruning?: PruningFunction;
  private readonly hooks: PollingComputableHooks;

  constructor(private readonly pl: PlClient,
              private readonly root: ResourceId,
              ops: SynchronizedTreeOps) {
    const { finalPredicate, pruning, pollingInterval, stopPollingDelay } = ops;
    this.pruning = pruning;
    this.pollingInterval = pollingInterval;
    this.finalPredicate = finalPredicate;
    this.state = new PlTreeState(root, finalPredicate);
    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(),
      () => this.stopUpdating(),
      { stopDebounce: stopPollingDelay },
      (resolve, reject) => this.scheduleOnNextState(resolve, reject)
    );
  }

  /** @deprecated use "entry" instead */
  public accessor(rid: ResourceId = this.root): PlTreeEntry {
    return this.entry(rid);
  }

  public entry(rid: ResourceId = this.root): PlTreeEntry {
    return new PlTreeEntry(
      { treeProvider: () => this.state, hooks: this.hooks },
      rid);
  }

  /** Can be used to externally kick off the synchronization polling loop, and
   * await for the first synchronization to happen. */
  public async refreshState(): Promise<void> {
    await this.hooks.refreshState();
  }

  private scheduledOnNextState: ScheduledRefresh[] = [];

  private scheduleOnNextState(resolve: () => void, reject: (err: any) => void): void {
    this.scheduledOnNextState.push({ resolve, reject });
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
      if (!this.keepRunning)
        break;

      // saving those who want to be notified about new state here
      // because those who will be added during the tree retrieval
      // should be notified only on the next round
      let toNotify: ScheduledRefresh[] | undefined = undefined;
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
        if (toNotify !== undefined)
          for (const n of toNotify)
            n.resolve();

      } catch (e: any) {
        console.error(e);

        // notifying that we failed to refresh the state
        if (toNotify !== undefined)
          for (const n of toNotify)
            n.reject(e);

        // catching tree update errors, as they may leave our tree in inconsistent state
        if (e instanceof TreeStateUpdateError) {
          // marking everybody who used previous state as changed
          this.state.invalidateTree();
          // creating new tree
          this.state = new PlTreeState(this.root, this.finalPredicate);
          // scheduling state update without delay
          continue;

          // unfortunately external observer may still see tree in its default
          // empty state, though this is best we can do in this exceptional
          // situation, and hope on caching layers inside computables to present
          // some stale state until we reconstruct the tree again
        }
      }

      if (!this.keepRunning)
        break;

      await sleep(this.pollingInterval);
    }

    // reset only as a very last line
    this.currentLoop = undefined;
  }
}
