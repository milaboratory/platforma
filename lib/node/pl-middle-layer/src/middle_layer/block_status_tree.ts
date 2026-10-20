/**
 * The live status tree of one block render, and the computable that folds it.
 *
 * A status tree is its own {@link SynchronizedTreeState}, seeded at the root status context of the
 * render rather than at the project. It has to be separate: the project tree prunes the status
 * fields (see `ProjectStatusFieldPattern`), because a status context holds the whole status
 * subtree of its render and every report into it is a KV write.
 *
 * One tree per watched block, held while anyone watches, terminated when the last holder lets go.
 *
 * Source: docs/text/work/projects/sdk/block-status/README_teo.md, "Backend <-> Middle layer".
 */

import type { PlClient, SignedResourceId } from "@milaboratories/pl-client";
import {
  hasCapability,
  isNullSignedResourceId,
  ResourceTypeName,
  treeFilter,
} from "@milaboratories/pl-client";
import type { ComputableCtx } from "@milaboratories/computable";
import { Computable, WatchableValue } from "@milaboratories/computable";
import type { PlTreeEntry, PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import type { BlockStatusSummary } from "@milaboratories/pl-model-middle-layer";
import {
  EmptyBlockStatusSummary,
  UnreadableBlockStatusSummary,
  UnsupportedBlockStatusSummary,
} from "@milaboratories/pl-model-middle-layer";
import { setTimeout } from "node:timers/promises";
import type { StatusContextNode } from "./block_status_fold";
import { foldBlockStatus } from "./block_status_fold";
import type { BlockStatusMode } from "./block_status";
import { projectFieldName } from "../model/project_model";
import type { MiddleLayerEnvironment } from "./middle_layer";

/** The backend capability that gates every status report. Without it no context is ever written. */
const StatusApiCapability = "statusApi:v1";

/**
 * How long the refetch loop waits between looks at the project's change generation.
 *
 * The tick itself reads an in-memory counter. It opens a read transaction only when the project
 * has changed since the last look, which while a block runs is most ticks: one read transaction
 * per second per watched block, which is the cost of noticing a re-run promptly.
 */
const RefetchDebounceMs = 1_000;

/** The poll floor of a status tree, as the spec sets it. */
const StatusTreePollingIntervalMs = 5_000;

/**
 * Deadline for the first load of a status tree.
 *
 * Deliberately NOT the project tree's, which disables the timeout outright: a status tree is
 * opened and closed while the app runs, and {@link BlockStatusWatch.terminate} awaits the loop, so
 * an init that never returns would hang a project close and with it the app's shutdown.
 */
const StatusTreeInitialLoadTimeoutMs = 30_000;

/** The status tree walks status contexts and nothing else. */
const statusTreeFieldFilter = treeFilter.resourceTypeEq(ResourceTypeName.StatusContext);

/** True when the connected backend accepts status reports at all. */
export function backendSupportsBlockStatus(pl: PlClient): boolean {
  return hasCapability(pl.serverInfo.capabilities ?? [], StatusApiCapability);
}

/**
 * The root status context of a block render, read once from the project.
 *
 * Undefined when the block has no context: it was never rendered, or it ran against a backend or a
 * middle layer that did not create one.
 */
export async function readBlockStatusRoot(
  pl: PlClient,
  projectRid: SignedResourceId,
  blockId: string,
  mode: BlockStatusMode,
): Promise<SignedResourceId | undefined> {
  return await pl.withReadTx("readBlockStatusRoot", async (tx) => {
    const project = await tx.getResourceData(projectRid, true);
    const fieldName = projectFieldName(blockId, mode === "prod" ? "prodStatus" : "stagingStatus");
    const statusField = project.fields.find((f) => f.name === fieldName);
    if (statusField === undefined || isNullSignedResourceId(statusField.value)) return undefined;
    return statusField.value;
  });
}

/** Adapts a tree node accessor to what {@link foldBlockStatus} reads. */
export function statusContextNode(acc: PlTreeNodeAccessor): StatusContextNode {
  return {
    id: String(acc.id),
    getData: () => acc.getDataAsJson<Record<string, unknown>>(),
    getValue: (key: string) => acc.getKeyValueAsString(key),
    listKeyValuesAsString: (prefix: string) => acc.listKeyValuesAsString(prefix),
    listFields: () => acc.listFields(),
    traverse: (field: string) => {
      // A child that carries an error is skipped rather than thrown: the status surface is
      // diagnostic, and one broken branch must not take the whole line down with it.
      const child = acc.traverse({ field, ignoreError: true });
      return child === undefined ? undefined : statusContextNode(child);
    },
  };
}

/**
 * The folded summary of the status tree rooted at `entry`.
 *
 * `reportsSupported` only labels an empty result: without the capability no transition will ever
 * be written, and the surface should say so rather than imply the run is silent.
 */
export function blockStatusSummary(
  entry: PlTreeEntry,
  reportsSupported: boolean,
  onError: (err: unknown) => void,
): Computable<BlockStatusSummary> {
  return Computable.make((ctx) => foldEntry(ctx, entry, reportsSupported, onError));
}

/**
 * Folds the context an entry points at, or reports that it could not be read.
 *
 * A context that is gone is the ordinary case, not a fault: an ephemeral context is dropped as
 * soon as the project stops holding it, which happens the moment the block is run again, and the
 * watch is briefly pointed at it until the next look for a new render. Breaking the panel over
 * that would be worse than saying nothing. The result is still distinguishable from a run that has
 * reported nothing, and the cause is logged, so a genuine fault here is not silent.
 */
function foldEntry(
  ctx: ComputableCtx,
  entry: PlTreeEntry,
  reportsSupported: boolean,
  onError: (err: unknown) => void,
): BlockStatusSummary {
  let summary: BlockStatusSummary;
  try {
    const node = ctx.accessor(entry).node({ ignoreError: true });
    if (node === undefined) return UnreadableBlockStatusSummary;
    summary = foldBlockStatus(statusContextNode(node));
  } catch (err: unknown) {
    onError(err);
    return UnreadableBlockStatusSummary;
  }

  if (reportsSupported || summary.totalNodes === 0) return summary;
  // The context exists and carries its data, but no transition can ever arrive.
  return { ...summary, availability: "unsupported" };
}

/**
 * The live status of one block render.
 *
 * The summary is stable across runs of the block: clicking Run creates a new render with a new
 * status context, and the watch re-seeds itself onto it rather than handing the caller a new
 * computable. The watch is shared between callers and reference counted; the tree lives until the
 * last holder releases it.
 */
export class BlockStatusWatch {
  /** The entry of the tree currently seeded, swapped when the block is run again. */
  private readonly source = new WatchableValue<PlTreeEntry | undefined>(undefined);
  private current?: { readonly root: SignedResourceId; readonly tree: SynchronizedTreeState };
  private readonly abortController = new AbortController();
  private loop?: Promise<void>;

  /**
   * Orders the seeds. A reseed that started before the one that last installed a root is stale by
   * the time it finishes, however long its tree took to open, and must not displace it.
   */
  private seedSequence = 0;
  private installedSeed = -1;

  /** How many callers hold this watch. The tree is terminated when it reaches zero. */
  private holders = 0;

  public readonly summary: Computable<BlockStatusSummary>;

  private constructor(
    private readonly env: MiddleLayerEnvironment,
    private readonly projectRid: SignedResourceId,
    private readonly blockId: string,
    private readonly mode: BlockStatusMode,
    /** The project tree's change generation, the trigger for looking for a new render. */
    private readonly projectGeneration: () => number,
  ) {
    const reportsSupported = backendSupportsBlockStatus(env.pl);
    // One computable for the life of the watch, reading whichever tree is seeded now, so a caller
    // keeps its handle across a re-run of the block.
    this.summary = Computable.make((ctx) => {
      const entry = this.source.getValue(ctx);
      if (entry === undefined)
        return reportsSupported ? EmptyBlockStatusSummary : UnsupportedBlockStatusSummary;
      return foldEntry(ctx, entry, reportsSupported, (err) =>
        this.env.logger.warn(new Error("block status fold failed", { cause: err })),
      );
    });
  }

  /**
   * Starts watching the status of a block render.
   *
   * The first seed is awaited, so the caller gets a handle that already reports whatever the
   * current render has reported. A block with no status context yet still gets a handle: it
   * reports an empty summary and seeds itself when a render that has one appears.
   *
   * The refetch loop is started only once that first seed has settled. Starting it in the
   * constructor would leave it running with nobody holding a reference to stop it if this throws.
   */
  public static async start(
    env: MiddleLayerEnvironment,
    projectRid: SignedResourceId,
    blockId: string,
    mode: BlockStatusMode,
    projectGeneration: () => number,
  ): Promise<BlockStatusWatch> {
    const watch = new BlockStatusWatch(env, projectRid, blockId, mode, projectGeneration);
    try {
      await watch.reseed();
    } catch (err: unknown) {
      await watch.terminateNow();
      throw err;
    }
    watch.holders = 1;
    watch.loop = watch.refetchLoop();
    watch.loop.catch((loopErr: unknown) => {
      env.logger.warn(new Error("block status refetch loop failed", { cause: loopErr }));
    });
    return watch;
  }

  /** Records one more caller holding this watch. */
  public retain(): void {
    this.holders++;
  }

  /**
   * Releases one caller's hold. The tree is terminated, and the watch is finished, only when the
   * last holder lets go; returns true when that happened.
   */
  public async release(): Promise<boolean> {
    if (this.holders > 0) this.holders--;
    if (this.holders > 0) return false;
    await this.terminateNow();
    return true;
  }

  /**
   * Stops the watch whatever the holder count, for a project being torn down. An ordinary caller
   * uses {@link release}.
   */
  public async terminate(): Promise<void> {
    this.holders = 0;
    await this.terminateNow();
  }

  /** Stops the loop, terminates the tree and releases the computable's holders. */
  private async terminateNow(): Promise<void> {
    this.abortController.abort();
    try {
      await this.loop;
    } catch {
      // already logged where it was raised
    }
    const held = this.current;
    this.current = undefined;
    this.source.setValue(undefined, "block status watch terminated");
    this.summary.resetState();
    await this.terminateTree(held?.tree);
  }

  /**
   * Looks for a new render while the caller watches.
   *
   * The project field holding the root context is pruned from the project tree, so the re-point is
   * not visible there; what is visible is that the project changed at all. A tick that finds the
   * same root installs nothing.
   */
  private async refetchLoop(): Promise<void> {
    let seen = this.projectGeneration();
    while (!this.abortController.signal.aborted) {
      try {
        await setTimeout(RefetchDebounceMs, undefined, { signal: this.abortController.signal });
      } catch {
        return; // aborted
      }

      const generation = this.projectGeneration();
      if (generation === seen) continue;

      try {
        await this.reseed();
        // Only once the look succeeded, so a failed one is retried on the next tick rather than
        // waiting for the project to change again.
        seen = generation;
      } catch (err: unknown) {
        if (this.abortController.signal.aborted) return;
        // The current tree stays in place: the surface keeps showing what it has rather than
        // going blank, and the next tick tries again.
        this.env.logger.warn(new Error("block status reseed failed", { cause: err }));
      }
    }
  }

  /** Points the summary at the current render's context, replacing any earlier one. */
  private async reseed(): Promise<void> {
    const seed = ++this.seedSequence;

    const root = await readBlockStatusRoot(this.env.pl, this.projectRid, this.blockId, this.mode);
    if (this.abortController.signal.aborted) return;
    if (seed < this.installedSeed) return;
    if (root === this.current?.root) return;

    const tree =
      root === undefined
        ? undefined
        : await SynchronizedTreeState.init(
            this.env.pl,
            root,
            {
              ...this.env.ops.defaultTreeOptions,
              pollingInterval: StatusTreePollingIntervalMs,
              initialTreeLoadingTimeout: StatusTreeInitialLoadTimeoutMs,
              fieldFilter: statusTreeFieldFilter,
              // A context never becomes final: the backend keeps reporting into it for as long as
              // its render lives, so every poll has to seed it again.
              rootsNeverFinal: true,
            },
            this.env.logger,
          );

    // Opening the tree took time, and a later reseed may have installed a newer root meanwhile.
    // Terminating the tree just opened is the whole cost of losing that race.
    if (this.abortController.signal.aborted || seed < this.installedSeed) {
      await this.terminateTree(tree);
      return;
    }

    const previous = this.current;
    this.installedSeed = seed;
    this.current = root !== undefined && tree !== undefined ? { root, tree } : undefined;

    // Swapped before the old tree is terminated. A computable body runs to completion
    // synchronously, so after this returns no reader is inside the old tree.
    this.source.setValue(tree?.entry(), "block status root changed");
    await this.terminateTree(previous?.tree);
  }

  private async terminateTree(tree: SynchronizedTreeState | undefined): Promise<void> {
    if (tree === undefined) return;
    try {
      await tree.terminate();
    } catch (err: unknown) {
      // terminate() can throw when the sync loop had already failed; nothing is left to clean up.
      this.env.logger.warn(new Error("block status tree termination failed", { cause: err }));
    }
  }
}
