/**
 * The live action-context tree of one block render, and the computables that fold it.
 *
 * A status tree is its own {@link SynchronizedTreeState}, seeded at the root action context of the
 * render rather than at the project. It has to be separate: the project tree prunes the context
 * fields (see `ProjectStatusFieldPattern`), because a context holds the whole subtree of its render
 * and every report into it is a KV write.
 *
 * One tree per watched block, held while anyone watches, terminated when the last holder lets go.
 */

import type { PlClient, SignedResourceId } from "@milaboratories/pl-client";
import { isNullSignedResourceId, ResourceTypeName, treeFilter } from "@milaboratories/pl-client";
import { Computable, WatchableValue } from "@milaboratories/computable";
import type { PlTreeEntry, PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import type { BlockStatusSummary, BlockStatusTree } from "@milaboratories/pl-model-middle-layer";
import {
  EmptyBlockStatusSummary,
  UnreadableBlockStatusSummary,
  UnsupportedBlockStatusSummary,
} from "@milaboratories/pl-model-middle-layer";
import { setTimeout } from "node:timers/promises";
import type { ActionContextNode, SubtreeFold } from "./block_status_fold";
import { childContexts, foldContext, mergeSubtree, summarize } from "./block_status_fold";
import { blockStatusTree, emptyBlockStatusTree } from "./block_status_tree_fold";
import type { BlockActionContextMode } from "./block_action_context";
import { ActionContextLinkCapability } from "../mutator/template/render_block";
import { projectFieldName } from "../model/project_model";
import type { MiddleLayerEnvironment } from "./middle_layer";

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

/** The status tree walks action contexts and nothing else. */
const statusTreeFieldFilter = treeFilter.resourceTypeEq(ResourceTypeName.ActionContext);

/**
 * The root action context of a block render, read once from the project.
 *
 * Undefined when the block has no context: it was never rendered, or it ran against a backend or a
 * middle layer that did not create one.
 */
export async function readBlockActionContextRoot(
  pl: PlClient,
  projectRid: SignedResourceId,
  blockId: string,
  mode: BlockActionContextMode,
): Promise<SignedResourceId | undefined> {
  return await pl.withReadTx("readBlockActionContextRoot", async (tx) => {
    const project = await tx.getResourceData(projectRid, true);
    const fieldName = projectFieldName(
      blockId,
      mode === "prod" ? "prodActionContext" : "stagingActionContext",
    );
    const statusField = project.fields.find((f) => f.name === fieldName);
    if (statusField === undefined || isNullSignedResourceId(statusField.value)) return undefined;
    return statusField.value;
  });
}

/** Adapts a tree node accessor to what the fold reads. */
export function actionContextNode(acc: PlTreeNodeAccessor): ActionContextNode {
  return {
    id: String(acc.id),
    getData: () => acc.getDataAsJson<Record<string, unknown>>(),
    listKeyValuesAsString: (prefix: string) => acc.listKeyValuesAsString(prefix),
    listFields: () => acc.listFields(),
    traverse: (field: string) => {
      // A child that carries an error is skipped rather than thrown: the status surface is
      // diagnostic, and one broken branch must not take the whole line down with it.
      const child = acc.traverse({ field, ignoreError: true });
      return child === undefined ? undefined : actionContextNode(child);
    },
  };
}

/**
 * The fold of the context an entry points at and everything under it, one computable per context.
 *
 * A report is a KV write into one context, and only that context's computable reads its KV, so a
 * report re-reads that one context. Each computable above it re-merges its direct children, which
 * are cached, and nothing else in the tree is read again.
 *
 * Undefined when the context cannot be read. A context that is gone is the ordinary case, not a
 * fault: an ephemeral context is dropped as soon as the project stops holding it, which happens the
 * moment the block is run again, and the watch is briefly pointed at it until the next look for a
 * new render. A child that cannot be read is left out rather than breaking the whole run's status.
 * The cause is logged, so a genuine fault is not silent.
 */
export function subtreeFold(
  entry: PlTreeEntry,
  path: ReadonlySet<string>,
  onError: (err: unknown) => void,
): Computable<SubtreeFold | undefined> {
  return Computable.make(
    (ctx) => {
      try {
        const acc = ctx.accessor(entry).node({ ignoreError: true });
        if (acc === undefined) return undefined;
        const node = actionContextNode(acc);
        const below = new Set(path).add(node.id);
        const children = childContexts(
          acc.listFields(),
          // A child that carries an error is skipped rather than thrown, as in actionContextNode.
          (field) => acc.traverse({ field, ignoreError: true }),
          below,
        ).map((child) => subtreeFold(child.persist(), below, onError));
        return { own: foldContext(node), children };
      } catch (err: unknown) {
        onError(err);
        return undefined;
      }
    },
    {
      key: `block-status-context/${entry.id}`,
      postprocessValue: (value) => {
        if (value === undefined) return undefined;
        const children: SubtreeFold[] = [];
        for (const child of value.children) if (child !== undefined) children.push(child);
        return mergeSubtree(value.own, children);
      },
    },
  );
}

/** The summary of the run whose root context an entry points at. */
export function entrySummary(
  entry: PlTreeEntry,
  reportsSupported: boolean,
  onError: (err: unknown) => void,
): Computable<BlockStatusSummary> {
  return Computable.make(() => ({ fold: subtreeFold(entry, new Set(), onError) }), {
    key: `block-status-summary/${entry.id}`,
    postprocessValue: ({ fold }) => summaryOfFold(fold, reportsSupported),
  });
}

/** The summary of a fold, or of a root context that could not be read. */
function summaryOfFold(
  fold: SubtreeFold | undefined,
  reportsSupported: boolean,
): BlockStatusSummary {
  // The counters of a context that could not be read are unknown, not zero.
  if (fold === undefined) return UnreadableBlockStatusSummary;
  const summary = summarize(fold);
  if (reportsSupported || summary.totalContexts === 0) return summary;
  // The context exists and carries its data, but no transition can ever arrive.
  return { ...summary, availability: "unsupported" };
}

/** What {@link BlockStatusWatch.start} watches. */
export type BlockStatusWatchParams = {
  readonly env: MiddleLayerEnvironment;
  readonly projectRid: SignedResourceId;
  readonly blockId: string;
  readonly mode: BlockActionContextMode;
  /** The project tree's change generation, the trigger for looking for a new render. */
  readonly projectGeneration: () => number;
};

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

  /**
   * The contexts whose children {@link tree} shows. Shared by every holder: two windows on one
   * block see one expansion.
   */
  private readonly expanded = new WatchableValue<ReadonlySet<string>>(new Set());

  /**
   * The run's tree, context by context, over the same synchronized tree as {@link summary}. It
   * keeps its own per-context computables, so watching it doubles the cost of a report.
   */
  public readonly tree: Computable<BlockStatusTree>;

  private readonly env: MiddleLayerEnvironment;
  private readonly projectRid: SignedResourceId;
  private readonly blockId: string;
  private readonly mode: BlockActionContextMode;
  private readonly projectGeneration: () => number;

  private constructor({
    env,
    projectRid,
    blockId,
    mode,
    projectGeneration,
  }: BlockStatusWatchParams) {
    this.env = env;
    this.projectRid = projectRid;
    this.blockId = blockId;
    this.mode = mode;
    this.projectGeneration = projectGeneration;
    // Without the `actionContext` link a block has no context and nothing is ever reported.
    const reportsSupported = env.pl.hasCapability(ActionContextLinkCapability);
    // One computable for the life of the watch, reading whichever tree is seeded now, so a caller
    // keeps its handle across a re-run of the block.
    this.summary = Computable.make((ctx) => {
      const entry = this.source.getValue(ctx);
      if (entry === undefined)
        return reportsSupported ? EmptyBlockStatusSummary : UnsupportedBlockStatusSummary;
      return entrySummary(entry, reportsSupported, (err) =>
        this.env.logger.warn(new Error("block status fold failed", { cause: err })),
      );
    });
    // The expansion is read in the body, so expanding re-runs it; the per-context computables
    // under it keep their keys and so their cached folds.
    this.tree = Computable.make(
      (ctx) => {
        const entry = this.source.getValue(ctx);
        return {
          seeded: entry !== undefined,
          expanded: [...this.expanded.getValue(ctx)],
          fold:
            entry === undefined
              ? undefined
              : subtreeFold(entry, new Set(), (err) =>
                  this.env.logger.warn(new Error("block status tree fold failed", { cause: err })),
                ),
        };
      },
      {
        postprocessValue: ({ seeded, expanded, fold }) => {
          if (!seeded)
            return emptyBlockStatusTree(
              reportsSupported ? EmptyBlockStatusSummary : UnsupportedBlockStatusSummary,
            );
          if (fold === undefined) return emptyBlockStatusTree(UnreadableBlockStatusSummary);
          return blockStatusTree(fold, summaryOfFold(fold, reportsSupported), new Set(expanded));
        },
      },
    );
  }

  /** Replaces the set of contexts whose children {@link tree} shows. */
  public setExpanded(contextIds: readonly string[]): void {
    this.expanded.setValue(new Set(contextIds), "block status tree expansion changed");
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
  public static async start(params: BlockStatusWatchParams): Promise<BlockStatusWatch> {
    const watch = new BlockStatusWatch(params);
    try {
      await watch.reseed();
    } catch (err: unknown) {
      await watch.terminateNow();
      throw err;
    }
    watch.begin();
    return watch;
  }

  /** Takes the first holder and starts looking for new renders, once the first seed settled. */
  private begin(): void {
    this.holders = 1;
    // The loop handles its own errors; this catch is only a backstop, so the promise kept here
    // never rejects and can be awaited as is.
    this.loop = this.refetchLoop().catch((err: unknown) => {
      this.env.logger.warn(new Error("block status refetch loop failed", { cause: err }));
    });
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
    await this.loop;
    const held = this.current;
    this.current = undefined;
    this.source.setValue(undefined, "block status watch terminated");
    this.summary.resetState();
    this.tree.resetState();
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

    const root = await readBlockActionContextRoot(
      this.env.pl,
      this.projectRid,
      this.blockId,
      this.mode,
    );
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
