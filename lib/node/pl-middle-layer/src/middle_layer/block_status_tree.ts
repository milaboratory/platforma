/**
 * The live status tree of one block render, and the computable that folds it.
 *
 * A status tree is its own {@link SynchronizedTreeState}, seeded at the root status context of the
 * render rather than at the project. It has to be separate: the project tree prunes the status
 * fields (see `ProjectStatusFieldPattern`), because a status context holds the whole status
 * subtree of its render and every report into it is a KV write, which would otherwise recompute
 * the project overview and churn its snapshot on every step of every sample.
 *
 * One tree per watched block, terminated when the block stops being watched. Nothing else shares
 * it, and it touches no resource the project tree reads.
 *
 * See docs/text/work/projects/sdk/block-status/README_teo.md.
 */

import type { PlClient, SignedResourceId } from "@milaboratories/pl-client";
import {
  hasCapability,
  isNotNullSignedResourceId,
  isNullSignedResourceId,
} from "@milaboratories/pl-client";
import type { ComputableCtx } from "@milaboratories/computable";
import { Computable, WatchableValue } from "@milaboratories/computable";
import type { PlTreeEntry, PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import type { BlockStatusSummary } from "@milaboratories/pl-model-middle-layer";
import { EmptyBlockStatusSummary } from "@milaboratories/pl-model-middle-layer";
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
 * The loop reads an in-memory counter, so a tick costs nothing; it opens a transaction only when
 * the project has actually changed. This is the debounce the spec asks for on the project-change
 * trigger.
 */
const RefetchDebounceMs = 1_000;

/**
 * True when the connected backend accepts status reports at all.
 *
 * Not a gate on reading: the middle layer creates the context itself, so its data (the block, the
 * run) is there whatever the backend does, and a tree seeded at it is readable either way. Without
 * the capability no transition is ever written, so the summary simply names no state. A surface
 * that wants to say why it is empty asks this.
 */
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

/**
 * Adapts a tree node accessor to what {@link foldBlockStatus} reads.
 *
 * A child context that carries an error is skipped rather than thrown: the status surface is
 * diagnostic, and one broken branch must not take the whole line down with it.
 */
export function statusContextNode(acc: PlTreeNodeAccessor): StatusContextNode {
  return {
    id: String(acc.id),
    originalId: isNotNullSignedResourceId(acc.originalId) ? String(acc.originalId) : undefined,
    getData: () => acc.getDataAsJson<Record<string, unknown>>(),
    listKeyValuesAsString: (prefix?: string) => acc.listKeyValuesAsString(prefix),
    listFields: () => acc.listFields(),
    traverse: (field: string) => {
      const child = acc.traverse({ field, ignoreError: true });
      return child === undefined ? undefined : statusContextNode(child);
    },
  };
}

/**
 * The folded summary of the status tree rooted at `entry`.
 *
 * Always defined: a root that cannot be read yet folds to {@link EmptyBlockStatusSummary} rather
 * than to undefined, so the surface has something to show from the first poll.
 */
export function blockStatusSummary(entry: PlTreeEntry): Computable<BlockStatusSummary> {
  return Computable.make((ctx) => foldEntry(ctx, entry));
}

/**
 * Folds the context an entry points at, or reports nothing when it cannot be read.
 *
 * A context that is gone is the ordinary case, not a fault: an ephemeral context is dropped as
 * soon as the project stops holding it, which happens the moment the block is run again, and the
 * watch is briefly pointed at it until the next look for a new render. A status surface that broke
 * the panel over that would be worse than one that says nothing, so every failure to read the
 * context folds to an empty summary.
 */
function foldEntry(ctx: ComputableCtx, entry: PlTreeEntry): BlockStatusSummary {
  try {
    const node = ctx.accessor(entry).node({ ignoreError: true });
    if (node === undefined) return EmptyBlockStatusSummary;
    return foldBlockStatus(statusContextNode(node));
  } catch {
    return EmptyBlockStatusSummary;
  }
}

/**
 * The live status of one block render.
 *
 * {@link summary} is stable across runs of the block: clicking Run creates a new render with a new
 * status context, and the watch re-seeds itself onto it rather than handing the caller a new
 * computable. The caller holds one handle for as long as it shows the status, and calls
 * {@link terminate} when it stops.
 */
export class BlockStatusWatch {
  /** The entry of the tree currently seeded, swapped when the block is run again. */
  private readonly source = new WatchableValue<PlTreeEntry | undefined>(undefined);
  private current?: { readonly root: SignedResourceId; readonly tree: SynchronizedTreeState };
  private readonly abortController = new AbortController();
  private readonly loop: Promise<void>;

  /** The folded status of whichever render the watch is currently seeded at. */
  public readonly summary: Computable<BlockStatusSummary>;

  private constructor(
    private readonly env: MiddleLayerEnvironment,
    private readonly projectRid: SignedResourceId,
    private readonly blockId: string,
    private readonly mode: BlockStatusMode,
    /** The project tree's change generation, the trigger for looking for a new render. */
    private readonly projectGeneration: () => number,
  ) {
    // One computable for the life of the watch, reading whichever tree is seeded now, so a caller
    // keeps its handle across a re-run of the block.
    this.summary = Computable.make((ctx) => {
      const entry = this.source.getValue(ctx);
      return entry === undefined ? EmptyBlockStatusSummary : foldEntry(ctx, entry);
    });

    this.loop = this.refetchLoop();
    this.loop.catch((err: unknown) => {
      this.env.logger.warn(new Error("block status refetch loop failed", { cause: err }));
    });
  }

  /**
   * Starts watching the status of a block render.
   *
   * The first seed is awaited, so the caller gets a handle that already reports whatever the
   * current render has reported. A block with no status context yet still gets a handle: it
   * reports an empty summary and seeds itself when a render that has one appears.
   */
  public static async start(
    env: MiddleLayerEnvironment,
    projectRid: SignedResourceId,
    blockId: string,
    mode: BlockStatusMode,
    projectGeneration: () => number,
  ): Promise<BlockStatusWatch> {
    const watch = new BlockStatusWatch(env, projectRid, blockId, mode, projectGeneration);
    await watch.reseed();
    return watch;
  }

  /** Stops the loop, terminates the tree and releases the computable's holders. */
  public async terminate(): Promise<void> {
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
   * not visible there; what is visible is that the project changed at all, which is the trigger
   * the spec names. A tick that finds the same root does nothing and costs no transaction beyond
   * the one read.
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
      seen = generation;

      try {
        await this.reseed();
      } catch (err: unknown) {
        if (this.abortController.signal.aborted) return;
        // A failed look leaves the current tree in place: the surface keeps showing what it has
        // rather than going blank, and the next change of the project tries again.
        this.env.logger.warn(new Error("block status reseed failed", { cause: err }));
      }
    }
  }

  /** Points the summary at the current render's context, replacing any earlier one. */
  private async reseed(): Promise<void> {
    const root = await readBlockStatusRoot(this.env.pl, this.projectRid, this.blockId, this.mode);
    if (root === this.current?.root) return;
    if (this.abortController.signal.aborted) return;

    const tree =
      root === undefined
        ? undefined
        : await SynchronizedTreeState.init(
            this.env.pl,
            root,
            {
              ...this.env.ops.defaultTreeOptions,
              // A context never becomes final: the backend keeps reporting into it for as long as
              // its render lives, so every poll has to seed it again. Reading stops when this
              // watch is terminated, not through finality.
              rootsNeverFinal: true,
            },
            this.env.logger,
          );

    const previous = this.current;
    this.current = root !== undefined && tree !== undefined ? { root, tree } : undefined;

    // Swapped before the old tree is terminated. A computable body runs to completion
    // synchronously, so after this returns no reader can still be inside the old tree, and
    // terminating it cannot invalidate a read in flight.
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
