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
import {
  isUnauthenticated,
  isTimeoutOrCancelError,
  isUnimplementedError,
} from "@milaboratories/pl-client";
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

/** Ceiling for the adaptive poll interval. Caps how stale an idle tree can get before the
 * next look, and bounds how far the idle backoff can push the interval out. */
const MAX_POLLING_INTERVAL_MS = 5_000;

/** Applied to the interval after a cycle that changed nothing. An idle tree walks its
 * interval out towards {@link MAX_POLLING_INTERVAL_MS} instead of re-polling at full rate;
 * the first cycle that changes anything resets it. */
const IDLE_BACKOFF_MULTIPLIER = 1.5;

/** The client's measured RTT becomes an interval floor, scaled by this. Every refresh costs
 * at least one round trip, so polling faster than a small multiple of the RTT only queues
 * round-trips the link cannot service. This is what replaces the fixed interval on a
 * high-latency link; on a fast link the configured `pollingInterval` still dominates. */
const RTT_POLL_FACTOR = 2;

/** Ceiling for the RTT-derived floor. The estimate is sampled at connect time and never
 * re-sampled, so without a bound one slow ping pins the cadence high for the whole session.
 * Mirrors `MAX_ADAPTIVE_REQUEST_TIMEOUT` on the deadline side: past this the link is stuck
 * rather than slow, and spacing polls further only delays noticing it recovered. */
const MAX_RTT_POLL_INTERVAL_MS = 30_000;

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

/** How often a tree with shared-type seeds re-polls ListUserResources to reconcile its
 * discovered roots.
 *
 * Discovery (a full ListUserResources stream) is far heavier than an ordinary incremental
 * refresh, so it must NOT run on every refresh tick. This is a wall-clock interval rather
 * than a count of iterations: the refresh cadence is adaptive (it stretches towards
 * {@link MAX_POLLING_INTERVAL_MS} on an idle tree and scales with RTT on a slow link),
 * so a fixed iteration count would let discovery latency drift out with it. Keeping it in
 * milliseconds pins the latency of noticing a new/removed share regardless of cadence, which
 * is what a human-driven share flow cares about.
 *
 * Only trees with shared-type seeds gate on this; {@link discover} is a no-op for single-root
 * and explicit-seed trees (empty `sharedSeeds`), so the value never affects them. */
const DISCOVERY_INTERVAL_MS = 3_000;

/** Counters that mean "this cycle brought something new". Deliberately not the full change
 * breakdown: those fields are sub-counts of `resourcesChanged` and would double-count.
 * `resourcesUnchanged` is excluded by design, since a cycle that only re-fetched unchanged
 * state is exactly the idle case the backoff exists for. */
function countedChanges(stat: TreeLoadingStat): number {
  return stat.resourcesNew + stat.resourcesChanged + stat.resourcesMarkedFinal;
}

/** The poll-cadence policy, as a pure function of the last cycle's outcome.
 *
 * `configuredMs` is the tree's static `pollingInterval` and acts as the lower bound, so no
 * link can be polled faster than configured. `rttMs` raises that bound on a slow link.
 * `currentMs` is the interval in force for the cycle that just finished, which is what the
 * idle backoff compounds on. */
export function derivePollingInterval(opts: {
  configuredMs: number;
  currentMs: number;
  rttMs: number | undefined;
  changed: boolean;
}): number {
  const { configuredMs, currentMs, rttMs, changed } = opts;

  // The cap applies to the RTT-derived part only, so `configuredMs` stays an absolute lower
  // bound even if it is ever set above the cap.
  const floor =
    rttMs === undefined
      ? configuredMs
      : Math.max(
          configuredMs,
          Math.min(MAX_RTT_POLL_INTERVAL_MS, Math.ceil(rttMs * RTT_POLL_FACTOR)),
        );

  const next = changed ? floor : Math.max(floor, currentMs * IDLE_BACKOFF_MULTIPLIER);

  // The ceiling never cuts below the floor: a link slower than MAX_POLLING_INTERVAL_MS still
  // gets its RTT-derived spacing rather than being forced to re-poll early.
  return Math.max(floor, Math.min(MAX_POLLING_INTERVAL_MS, next));
}

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
    this.effectivePollingInterval = pollingInterval;
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

  /** Interval actually used for the current wait. Starts at the configured `pollingInterval`
   * and is re-derived after every cycle by {@link updatePollingInterval}. */
  private effectivePollingInterval: number;

  /** Re-derives {@link effectivePollingInterval} after a cycle.
   *
   * Two independent effects. The floor scales with the client's measured RTT, so a
   * high-latency link stops queueing round-trips it cannot service. On top of that, a cycle
   * that changed nothing multiplies the interval out towards
   * {@link MAX_POLLING_INTERVAL_MS}, while any change snaps it straight back to the floor so
   * an active tree stays responsive. */
  private updatePollingInterval(changed: boolean): void {
    this.effectivePollingInterval = derivePollingInterval({
      configuredMs: this.pollingInterval,
      currentMs: this.effectivePollingInterval,
      rttMs: this.pl.rttEstimateMs,
      changed,
    });
  }

  /** Called from computable hooks when external observer asks for state refresh */
  private scheduleOnNextState(resolve: () => void, reject: (err: any) => void): void {
    if (this.terminated) reject(new Error("tree synchronization is terminated"));
    else {
      this.scheduledOnNextState.push({ resolve, reject });
      // Someone is waiting on fresh state, so this tree is not idle after all: drop any
      // accumulated backoff, otherwise the cycles right after a nudge stay slow. Routed
      // through the policy rather than assigning the configured value directly, so the RTT
      // floor survives the reset. Assigning it raw would poll a high-latency link faster than
      // it can answer, and the interval would stay there until the next cycle that completes:
      // the error path never reaches updatePollingInterval, so a failing nudged refresh would
      // keep retrying at the un-floored rate.
      this.updatePollingInterval(true);
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
    try {
      await this.loadAndApply(stats, txOps);
    } catch (e) {
      // Discovery-tree self-heal: a discovered root whose grant was revoked/expired fails the whole
      // ResourceTree poll with Unauthenticated. Re-discover (drops dead roots) and retry once. This is
      // self-discriminating — a genuinely dead session also fails discover()'s own call, so real auth
      // loss still propagates. Only for discovery trees; explicit-root trees propagate as-is.
      if (this.sharedSeeds.length > 0 && isUnauthenticated(e)) {
        this.logger?.warn(
          "discovery tree: Unauthenticated on ResourceTree (likely revoked/expired root); re-discovering and retrying",
        );
        await this.discover();
        await this.loadAndApply(stats, txOps);
      } else throw e;
    }
  }

  private async loadAndApply(stats?: TreeLoadingStat, txOps?: TxOps): Promise<void> {
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
    this.state.updateFromResourceData(data, { allowOrphanInputs: true, stat: stats });
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
      let ids: SignedResourceId[];
      try {
        // match by name only (permissive; ignores version, so it survives schema bumps)
        ids = await this.pl.userResources.listSharedResourcesByType(seed.resourceType.name);
      } catch (e: unknown) {
        if (isUnimplementedError(e)) continue;
        throw e;
      }
      for (const id of ids) discovered.add(id);
    }

    this.discoveredRoots = [...discovered];
    this.state.setRoots(this.currentRootSet());
  }

  /** If true this tree state is permanently terminaed. */
  private terminated = false;

  private async mainLoop() {
    // Always collected, even when not logging: the change counters drive the idle backoff
    // below. Counter bumps are cheap next to the round trip they describe.
    let stat = initialTreeLoadingStat();

    let lastUpdate = Date.now();

    // paces the discovery poll for shared-type seeds; 0 forces discovery on the first pass.
    let lastDiscovery = 0;

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
        if (this.sharedSeeds.length > 0 && Date.now() - lastDiscovery >= DISCOVERY_INTERVAL_MS) {
          await this.discover();
          lastDiscovery = Date.now();
        }

        // Change counters before the refresh, so the delta tells us whether this single cycle
        // brought anything new. Works in both stat modes: "per-request" resets to 0 above.
        const changesBefore = countedChanges(stat);

        // actual tree synchronization
        await this.refresh(stat);

        this.updatePollingInterval(countedChanges(stat) > changesBefore);

        // logging stats if we were asked to
        if (this.logStat && this.logger)
          this.logger.info(
            `Tree stat (success, after ${Date.now() - lastUpdate}ms): ${JSON.stringify(stat)}`,
          );
        lastUpdate = Date.now();

        // notifying that we got new state
        if (toNotify !== undefined) for (const n of toNotify) n.resolve();
      } catch (e: any) {
        // logging stats if we were asked to (even if error occured)
        if (this.logStat && this.logger)
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
        const remaining = Math.max(0, this.effectivePollingInterval - MIN_POLLING_INTERVAL_MS);
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
