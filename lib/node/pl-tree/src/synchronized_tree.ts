import { PollingComputableHooks } from "@milaboratories/computable";
import { PlTreeEntry } from "./accessors";
import type {
  FinalResourceDataPredicate,
  PlClient,
  SignedResourceId,
  TxOps,
} from "@milaboratories/pl-client";
import type { Filter } from "@milaboratories/pl-client";
import { isTimeoutOrCancelError } from "@milaboratories/pl-client";
import type { ExtendedResourceData } from "./state";
import { PlTreeState, TreeStateUpdateError } from "./state";
import type { PruningFunction, TraversalMode, TreeLoadingStat } from "./sync";
import { constructTreeLoadingRequest, initialTreeLoadingStat, loadTreeState } from "./sync";
import * as tp from "node:timers/promises";

/** Hard floor between consecutive tree-refresh calls.
 * Applies even when {@link scheduleOnNextState} has woken the loop early,
 * preventing tight polling loops during rapid state transitions. */
const MIN_POLLING_INTERVAL_MS = 100;
import type { MiLogger } from "@milaboratories/ts-helpers";

type StatLoggingMode = "cumulative" | "per-request";

export type SynchronizedTreeOps = {
  /** Override final predicate from the PlClient */
  finalPredicateOverride?: FinalResourceDataPredicate;

  /** Pruning function for legacy fallback path. */
  pruning?: PruningFunction;

  /** ResourceTree field filters for modern backend path. */
  fieldFilters?: Filter[];

  /** ResourceTree traversal stop rules for modern backend path. */
  traverseStopRules?: Filter;

  /** Interval after last sync to sleep before the next one */
  pollingInterval: number;
  /** For how long to continue polling after the last derived value access */
  stopPollingDelay: number;

  /** If one of the values, tree will log stats of each polling request */
  logStat?: StatLoggingMode;

  /** Timeout for initial tree loading. If not specified, will use default for RO tx from pl-client. */
  initialTreeLoadingTimeout?: number;

  /** Controls which tree-loading path to use.  Default `"auto"`. */
  traversalMode?: TraversalMode;
};

type ScheduledRefresh = {
  resolve: () => void;
  reject: (err: any) => void;
};

export class SynchronizedTreeState {
  private readonly finalPredicate: FinalResourceDataPredicate;
  private state: PlTreeState;
  private readonly pollingInterval: number;
  private readonly pruning?: PruningFunction;
  private readonly fieldFilters?: Filter[];
  private readonly traverseStopRules?: Filter;
  private readonly traversalMode: TraversalMode;
  private readonly logStat?: StatLoggingMode;
  private readonly hooks: PollingComputableHooks;
  private readonly abortController = new AbortController();

  private constructor(
    private readonly pl: PlClient,
    private readonly root: SignedResourceId,
    ops: SynchronizedTreeOps,
    private readonly logger?: MiLogger,
  ) {
    const {
      finalPredicateOverride,
      pruning,
      fieldFilters,
      traverseStopRules,
      traversalMode,
      pollingInterval,
      stopPollingDelay,
      logStat,
    } = ops;
    this.pruning = pruning;
    this.fieldFilters = fieldFilters;
    this.traverseStopRules = traverseStopRules;
    this.traversalMode = traversalMode ?? "auto";
    this.pollingInterval = pollingInterval;
    this.finalPredicate = finalPredicateOverride ?? pl.finalPredicate;
    this.logStat = logStat;
    this.state = new PlTreeState(root, this.finalPredicate);
    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(),
      () => this.stopUpdating(),
      { stopDebounce: stopPollingDelay },
      (resolve, reject) => this.scheduleOnNextState(resolve, reject),
    );
  }

  /** @deprecated use "entry" instead */
  public accessor(rid: SignedResourceId = this.root): PlTreeEntry {
    if (this.terminated) throw new Error("tree synchronization is terminated");
    return this.entry(rid);
  }

  public entry(rid: SignedResourceId = this.root): PlTreeEntry {
    if (this.terminated) throw new Error("tree synchronization is terminated");
    return new PlTreeEntry({ treeProvider: () => this.state, hooks: this.hooks }, rid);
  }

  /** Can be used to externally kick off the synchronization polling loop, and
   * await for the first synchronization to happen. */
  public async refreshState(): Promise<void> {
    if (this.terminated) throw new Error("tree synchronization is terminated");
    await this.hooks.refreshState();
  }

  private currentLoopDelayInterrupt: AbortController | undefined = undefined;
  private scheduledOnNextState: ScheduledRefresh[] = [];

  /** Called from computable hooks when external observer asks for state refresh */
  private scheduleOnNextState(resolve: () => void, reject: (err: any) => void): void {
    if (this.terminated) reject(new Error("tree synchronization is terminated"));
    else {
      this.scheduledOnNextState.push({ resolve, reject });
      if (this.currentLoopDelayInterrupt) {
        this.currentLoopDelayInterrupt.abort();
        this.currentLoopDelayInterrupt = undefined;
      }
    }
  }

  /** Called from observer */
  private startUpdating(): void {
    if (this.terminated) return;
    this.keepRunning = true;
    if (this.currentLoop === undefined) this.currentLoop = this.mainLoop();
  }

  /** Called from observer */
  private stopUpdating(): void {
    this.keepRunning = false;
  }

  /** If true, main loop will continue polling pl state. */
  private keepRunning = false;
  /** Actual state of main loop. */
  private currentLoop: Promise<void> | undefined = undefined;

  /** Executed from the main loop, and initialization procedure. */
  private async refresh(stats?: TreeLoadingStat, txOps?: TxOps): Promise<void> {
    if (this.terminated) throw new Error("tree synchronization is terminated");
    const request = constructTreeLoadingRequest(this.state, {
      pruningFunction: this.pruning,
      fieldFilters: this.fieldFilters,
      traverseStopRules: this.traverseStopRules,
    });
    const data = await this.pl.withReadTx(
      "ReadingTree",
      async (tx) => {
        return await loadTreeState(
          tx,
          request,
          stats,
          this.pl.serverInfo.capabilities ?? [],
          this.traversalMode,
          this.logger,
        );
      },
      txOps,
    );
    this.state.updateFromResourceData(data, true);
  }

  /** If true this tree state is permanently terminaed. */
  private terminated = false;

  private async mainLoop() {
    // will hold request stats
    let stat = this.logStat ? initialTreeLoadingStat() : undefined;

    let lastUpdate = Date.now();

    while (true) {
      if (!this.keepRunning || this.terminated) break;

      // saving those who want to be notified about new state here
      // because those who will be added during the tree retrieval
      // should be notified only on the next round
      let toNotify: ScheduledRefresh[] | undefined = undefined;
      if (this.scheduledOnNextState.length > 0) {
        toNotify = this.scheduledOnNextState;
        this.scheduledOnNextState = [];
      }

      try {
        // resetting stats if we were asked to collect non-cumulative stats
        if (this.logStat === "per-request") stat = initialTreeLoadingStat();

        // actual tree synchronization
        await this.refresh(stat);

        // logging stats if we were asked to
        if (stat && this.logger)
          this.logger.info(
            `Tree stat (success, after ${Date.now() - lastUpdate}ms): ${JSON.stringify(stat)}`,
          );
        lastUpdate = Date.now();

        // notifying that we got new state
        if (toNotify !== undefined) for (const n of toNotify) n.resolve();
      } catch (e: any) {
        // logging stats if we were asked to (even if error occured)
        if (stat && this.logger)
          this.logger.info(
            `Tree stat (error, after ${Date.now() - lastUpdate}ms): ${JSON.stringify(stat)}`,
          );
        lastUpdate = Date.now();

        // notifying that we failed to refresh the state
        if (toNotify !== undefined) for (const n of toNotify) n.reject(e);

        // catching tree update errors, as they may leave our tree in inconsistent state
        if (e instanceof TreeStateUpdateError) {
          // important error logging, this should never happen
          this.logger?.error(e);

          // marking everybody who used previous state as changed
          this.state.invalidateTree("stat update error");
          // creating new tree
          this.state = new PlTreeState(this.root, this.finalPredicate);

          // scheduling state update without delay
          continue;

          // unfortunately external observer may still see tree in its default
          // empty state, though this is best we can do in this exceptional
          // situation, and hope on caching layers inside computables to present
          // some stale state until we reconstruct the tree again
        } else this.logger?.warn(e);
      }

      if (!this.keepRunning || this.terminated) break;

      // Phase 1: mandatory floor — always wait at least MIN_POLLING_INTERVAL_MS.
      // Not interruptible by scheduleOnNextState; only termination aborts it.
      try {
        await tp.setTimeout(MIN_POLLING_INTERVAL_MS, undefined, {
          signal: this.abortController.signal,
        });
      } catch (e: unknown) {
        if (!isTimeoutOrCancelError(e)) throw new Error("Unexpected error", { cause: e });
        if (this.abortController.signal.aborted) break;
      }

      if (!this.keepRunning || this.terminated) break;

      // Phase 2: optional remainder up to pollingInterval — interruptible by
      // scheduleOnNextState so that an external nudge wakes the loop promptly.
      if (this.scheduledOnNextState.length === 0) {
        const remaining = Math.max(0, this.pollingInterval - MIN_POLLING_INTERVAL_MS);
        if (remaining > 0) {
          try {
            this.currentLoopDelayInterrupt = new AbortController();
            await tp.setTimeout(remaining, undefined, {
              signal: AbortSignal.any([
                this.abortController.signal,
                this.currentLoopDelayInterrupt.signal,
              ]),
            });
          } catch (e: unknown) {
            if (!isTimeoutOrCancelError(e)) throw new Error("Unexpected error", { cause: e });
            if (this.abortController.signal.aborted) break;
            // Otherwise it was just the loop delay interrupt (scheduleOnNextState),
            // continue to the next iteration
          } finally {
            this.currentLoopDelayInterrupt = undefined;
          }
        }
      }
    }

    // reset only as a very last line
    this.currentLoop = undefined;
  }

  /**
   * Dumps the current state of the tree.
   * @returns An array of ExtendedResourceData objects representing the current state of the tree.
   */
  public dumpState(): ExtendedResourceData[] {
    return this.state.dumpState();
  }

  /**
   * Terminates the internal loop, and permanently destoys all internal state, so
   * all computables using this state will resolve to errors.
   * */
  public async terminate(): Promise<void> {
    this.keepRunning = false;
    this.terminated = true;
    this.abortController.abort();

    if (this.currentLoop === undefined) return;
    await this.currentLoop;

    this.state.invalidateTree("synchronization terminated for the tree");
  }

  /** @deprecated */
  public async awaitSyncLoopTermination(): Promise<void> {
    if (this.currentLoop === undefined) return;
    await this.currentLoop;
  }

  public static async init(
    pl: PlClient,
    root: SignedResourceId,
    ops: SynchronizedTreeOps,
    logger?: MiLogger,
  ) {
    const tree = new SynchronizedTreeState(pl, root, ops, logger);

    const stat = ops.logStat ? initialTreeLoadingStat() : undefined;

    let ok = false;

    try {
      await tree.refresh(stat, {
        timeout: ops.initialTreeLoadingTimeout,
      });
      ok = true;
    } finally {
      // logging stats if we were asked to (even if error occured)
      if (stat && logger)
        logger.info(
          `Tree stat (initial load, ${ok ? "success" : "failure"}): ${JSON.stringify(stat)}`,
        );
    }

    return tree;
  }
}
