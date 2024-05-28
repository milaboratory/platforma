import { ComputableDataSource, TrackedAccessorProvider } from '@milaboratory/computable';
import { PlTreeEntryAccessor } from './accessors';
import { PlClient, ResourceId } from '@milaboratory/pl-client-v2';
import { FinalPredicate, PlTreeState } from './state';
import { constructTreeLoadingRequest, loadTreeState, PruningFunction } from './sync';
import { sleep } from '@milaboratory/ts-helpers';

export type TreeDataSourceOps = {
  finalPredicate?: FinalPredicate,
  pruning?: PruningFunction,
  pollingDelay: number;
}

export class TreeDataSource implements ComputableDataSource<PlTreeEntryAccessor> {
  private readonly state: PlTreeState;
  private readonly pollingDelay: number;
  private readonly pruning?: PruningFunction;

  public accessorFactory: TrackedAccessorProvider<PlTreeEntryAccessor>;

  constructor(private readonly pl: PlClient,
              root: ResourceId,
              ops: TreeDataSourceOps) {
    const { finalPredicate, pruning, pollingDelay } = ops;
    this.pruning = pruning;
    this.pollingDelay = pollingDelay;
    this.state = new PlTreeState(root, finalPredicate);
    this.accessorFactory = this.state.accessor();
  }

  startUpdating(): void {
    this.keepRunning = true;
    if (this.currentLoop === undefined)
      this.currentLoop = this.mainLoop();
  }

  stopUpdating(): void {
    this.keepRunning = false;
  }

  /** If true, main loop will continue polling pl state. */
  private keepRunning = false;
  /** Actual state of main loop. */
  private currentLoop: Promise<void> | undefined = undefined;

  private async mainLoop() {
    while (true) {
      try {
        const request = constructTreeLoadingRequest(this.state, this.pruning);
        const data = await this.pl.withReadTx('ReadingTree', async tx => {
          return await loadTreeState(tx, request);
        });
        this.state.updateFromResourceData(data, true);
      } catch (e: any) {
        // TODO LOG
      }
      if (!this.keepRunning)
        break;
      await sleep(this.pollingDelay);
      if (!this.keepRunning)
        break;
    }
    this.currentLoop = undefined;
  }
}
