import { PollingComputableHooks } from "@milaboratories/computable";
import { PlTreeEntry, PlTreeRootsEntry } from "./accessors";
import type {
  FinalResourceDataPredicate,
  PlClient,
  ResourceType,
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
import type { MiLogger } from "@milaboratories/ts-helpers";

/** Hard floor between consecutive tree-refresh calls.
 * Applies even when {@link scheduleOnNextState} has woken the loop early,
 * preventing tight polling loops during rapid state transitions. */
const MIN_POLLING_INTERVAL_MS = 100;

type StatLoggingMode = "cumulative" | "per-request";

export type SynchronizedTreeOps = {
  /** Override final predicate from the PlClient */
  finalPredicateOverride?: FinalResourceDataPredicate;

  /** Pruning function for legacy fallback path. */
  pruning?: PruningFunction;

  /** ResourceTree field filter for modern backend path. */
  fieldFilter?: Filter;

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

/** An explicit resource to serve as a tree root. Several explicit seeds may be passed. */
export type ExplicitRootSeed = { kind: "resource"; root: SignedResourceId };

/** Discovers, as roots, every resource of this type shared with the current user.
 *  Matched against SharedResource.resourceType by NAME (version optional/ignored). The
 *  discovered set is DYNAMIC — roots appear/disappear as grants are added/revoked/expire. */
export type SharedTypeSeed = { kind: "shared"; resourceType: ResourceType };

export type TreeSeed = ExplicitRootSeed | SharedTypeSeed;

/** Normalizes the {@link SynchronizedTreeState.init} seed argument — a bare
 * {@link SignedResourceId}, a single {@link TreeSeed}, or an array — to `TreeSeed[]`, so
 * every existing single-root caller is unchanged. */
function normalizeSeeds(seeds: SignedResourceId | TreeSeed | TreeSeed[]): TreeSeed[] {
  if (Array.isArray(seeds)) return seeds;
  if (typeof seeds === "object" && seeds !== null && "kind" in seeds) return [seeds];
  // bare SignedResourceId
  return [{ kind: "resource", root: seeds }];
}

/** How often, in main-loop iterations, a tree with shared-type seeds re-polls
 * ListUserResources to reconcile its discovered roots. 1 would mean every iteration.
 *
 * Discovery (a full ListUserResources stream) is far heavier than an ordinary incremental
 * refresh, so it must NOT run on every fast refresh tick. The refresh cadence is the tree's
 * `pollingInterval` floored by {@link MIN_POLLING_INTERVAL_MS} (~200ms-1s in practice — the
 * shared-seed discovery tree runs at the 200ms default). At N = 15 discovery fires roughly
 * every 15 × 200ms ≈ 3s, decoupling it from the fast refresh loop while keeping the latency
 * of noticing a new/removed share to a few seconds — acceptable for a human-driven share flow.
 *
 * Only trees with shared-type seeds gate on this; {@link discover} is a no-op for single-root
 * and explicit-seed trees (empty `sharedSeeds`), so the value never affects them. */
const DISCOVERY_EVERY_N_REFRESHES = 15;

type ScheduledRefresh = {
  resolve: () => void;
  reject: (err: any) => void;
};

export class SynchronizedTreeState {
  private readonly finalPredicate: FinalResourceDataPredicate;
  private state: PlTreeState;
  private readonly pollingInterval: number;
  private readonly pruning?: PruningFunction;
  private readonly fieldFilter?: Filter;
  private readonly traverseStopRules?: Filter;
  private readonly traversalMode: TraversalMode;
  private readonly logStat?: StatLoggingMode;
  private readonly hooks: PollingComputableHooks;
  private readonly abortController = new AbortController();

  /** Explicit-resource seeds: fixed roots, present from construction. */
  private readonly explicitRoots: SignedResourceId[];
  /** Shared-type seeds (discovered roots), if any. */
  private readonly sharedSeeds: SharedTypeSeed[];
  /** Roots discovered for shared-type seeds on the last discovery poll. */
  private discoveredRoots: SignedResourceId[] = [];

  private constructor(
    private readonly pl: PlClient,
    seeds: TreeSeed[],
    ops: SynchronizedTreeOps,
    private readonly logger?: MiLogger,
  ) {
    const {
      finalPredicateOverride,
      pruning,
      fieldFilter,
      traverseStopRules,
      traversalMode,
      pollingInterval,
      stopPollingDelay,
      logStat,
    } = ops;
    this.pruning = pruning;
    this.fieldFilter = fieldFilter;
    this.traverseStopRules = traverseStopRules;
    this.traversalMode = traversalMode ?? "auto";
    this.pollingInterval = pollingInterval;
    this.finalPredicate = finalPredicateOverride ?? pl.finalPredicate;
    this.logStat = logStat;

    this.explicitRoots = seeds
      .filter((s): s is ExplicitRootSeed => s.kind === "resource")
      .map((s) => s.root);
    this.sharedSeeds = seeds.filter((s): s is SharedTypeSeed => s.kind === "shared");

    this.state = new PlTreeState(this.currentRootSet(), this.finalPredicate);
    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(),
      () => this.stopUpdating(),
      { stopDebounce: stopPollingDelay },
      (resolve, reject) => this.scheduleOnNextState(resolve, reject),
    );
  }

  /** The current protected root set: explicit roots plus the latest discovered roots. */
  private currentRootSet(): Set<SignedResourceId> {
    return new Set([...this.explicitRoots, ...this.discoveredRoots]);
  }

  /** Resolves the single root for the backward-compatible single-root accessors, throwing
   * if the tree does not have exactly one root (guards legacy callers against multi-root). */
  private soleRoot(): SignedResourceId {
    const roots = this.currentRootSet();
    if (roots.size !== 1)
      throw new Error(
        `single-root accessor used on a tree with ${roots.size} roots; use rootsEntry() instead`,
      );
    return roots.values().next().value!;
  }

  /** @deprecated use "entry" instead */
  public accessor(rid?: SignedResourceId): PlTreeEntry {
    if (this.terminated) throw new Error("tree synchronization is terminated");
    return this.entry(rid);
  }

  /** Backward-compatible single-root entry. With no `rid` it returns the sole root's entry
   * and THROWS if the tree has zero or more than one root. An explicit `rid` addresses any
   * resource in the heap, as today. */
  public entry(rid?: SignedResourceId): PlTreeEntry {
    if (this.terminated) throw new Error("tree synchronization is terminated");
    return new PlTreeEntry(
      { treeProvider: () => this.state, hooks: this.hooks },
      rid ?? this.soleRoot(),
    );
  }

  /** Reactive provider for the current root SET. Reading it inside a Computable tracks the
   * set as a dependency, so the Computable recomputes when discovered roots appear/disappear. */
  public rootsEntry(): PlTreeRootsEntry {
    if (this.terminated) throw new Error("tree synchronization is terminated");
    return new PlTreeRootsEntry({ treeProvider: () => this.state, hooks: this.hooks });
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
      fieldFilter: this.fieldFilter,
      traverseStopRules: this.traverseStopRules,
    });
    // A shared-type-seed tree with no currently-discovered roots is legitimately empty:
    // there is nothing to traverse, and tx.resourceTree([]) would throw "at least one seed
    // must be provided". Skip the backend load and leave the (empty) state as-is — discovery
    // adds roots later via setRoots(), which schedules the next refresh. Explicit-root trees
    // never hit this (their root set is non-empty by construction).
    if (request.seedResources.length === 0 && request.finalResources.size === 0) return;
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

  /** Discovery sync for shared-type seeds: re-polls `ListUserResources` (gRPC-only) and
   * reconciles the discovered root set against the heap. A longer poll result adds roots; a
   * shorter one removes them (grant revoked/expired) — the removed roots' subtrees cascade
   * to collection via the ordinary refcount GC ({@link PlTreeState.setRoots}). No-op when the
   * tree has no shared-type seeds, or silently no-op on a REST client where `ListUserResources`
   * is unavailable. */
  private async discover(): Promise<void> {
    if (this.terminated) throw new Error("tree synchronization is terminated");
    if (this.sharedSeeds.length === 0) return;

    const discovered = new Set<SignedResourceId>();
    for (const seed of this.sharedSeeds) {
      // match by name only (permissive; ignores version, so it survives schema bumps)
      const ids = await this.pl.userResources.listSharedResourcesByType(seed.resourceType.name);
      for (const id of ids) discovered.add(id);
    }

    this.discoveredRoots = [...discovered];
    this.state.setRoots(this.currentRootSet());
  }

  /** If true this tree state is permanently terminaed. */
  private terminated = false;

  private async mainLoop() {
    // will hold request stats
    let stat = this.logStat ? initialTreeLoadingStat() : undefined;

    let lastUpdate = Date.now();

    // counts refresh iterations to pace the discovery poll for shared-type seeds.
    let iteration = 0;

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

        // discovery sync for shared-type seeds: reconcile the discovered root set before
        // refreshing, so newly discovered roots are materialized in this same iteration.
        if (this.sharedSeeds.length > 0 && iteration % DISCOVERY_EVERY_N_REFRESHES === 0) {
          await this.discover();
        }
        iteration++;

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
          // creating new tree with the full current root set (re-discovered on next iteration)
          this.state = new PlTreeState(this.currentRootSet(), this.finalPredicate);

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

  /**
   * Initializes a synchronized tree from one or more seeds.
   *
   * @param seeds a bare {@link SignedResourceId} (the original single-root contract), a
   *   single {@link TreeSeed}, or an array of seeds. Bare ids and explicit-resource seeds
   *   become roots immediately; shared-type seeds discover their roots via `ListUserResources`.
   */
  public static async init(
    pl: PlClient,
    seeds: SignedResourceId | TreeSeed | TreeSeed[],
    ops: SynchronizedTreeOps,
    logger?: MiLogger,
  ) {
    const tree = new SynchronizedTreeState(pl, normalizeSeeds(seeds), ops, logger);

    const stat = ops.logStat ? initialTreeLoadingStat() : undefined;

    let ok = false;

    try {
      // resolve shared-type seeds before the first refresh so discovered roots load now
      await tree.discover();
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
