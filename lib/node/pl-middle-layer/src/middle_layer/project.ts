import type { MiddleLayerEnvironment } from "./middle_layer";
import type {
  FieldData,
  Filter,
  OptionalAnyResourceId,
  PlClient,
  SignedResourceId,
} from "@milaboratories/pl-client";
import {
  DefaultRetryOptions,
  ensureSignedResourceIdNotNull,
  field,
  isNotFoundError,
  isPermissionDenied,
  isTimeoutOrCancelError,
  isUnauthenticated,
  parseSignedResourceId,
  Pl,
  resourceIdToString,
  ResourceTypeName,
  ResourceTypePrefix,
  treeFilter,
} from "@milaboratories/pl-client";
import type { ComputableStableDefined, ComputableValueOrErrors } from "@milaboratories/computable";
import { Computable } from "@milaboratories/computable";
import { projectOverview } from "./project_overview";
import type { BlockPackSpecAny } from "../model";
import { randomUUID } from "node:crypto";
import { withProject, withProjectAuthored } from "../mutator/project";
import type { ExtendedResourceData, PruningFunction } from "@milaboratories/pl-tree";
import {
  SynchronizedTreeState,
  treeDumpStats,
  TreeStateUpdateError,
} from "@milaboratories/pl-tree";
import type { TreeSnapshotStore } from "./tree_snapshot_store";
import { setTimeout } from "node:timers/promises";
import { frontendData } from "./frontend_path";
import type { NavigationState } from "@milaboratories/pl-model-common";
import { getBlockParameters, blockOutputs } from "./block";
import type { FrontendData } from "../model/frontend";
import type { ProjectId, ProjectStructure } from "../model/project_model";
import { projectFieldName } from "../model/project_model";
import {
  cachedDeserialize,
  notEmpty,
  type MiLogger,
  createInfiniteRetryState,
  nextInfiniteRetryState,
  type InfiniteRetryState,
} from "@milaboratories/ts-helpers";
import type { BlockPackInfo } from "../model/block_pack";
import type {
  ProjectOverview,
  AuthorMarker,
  BlockSettings,
  BlockStateInternalV3,
} from "@milaboratories/pl-model-middle-layer";
import { activeConfigs } from "./active_cfg";
import { NavigationStates } from "./navigation_states";
import { extractConfig, BLOCK_STORAGE_FACADE_VERSION } from "@platforma-sdk/model";
import fs from "node:fs/promises";
import canonicalize from "canonicalize";
import type { ProjectOverviewLight } from "./project_overview_light";
import { projectOverviewLight } from "./project_overview_light";
import { applyProjectMigrations } from "../mutator/migration";
import { cacheBlockPackTemplate } from "../mutator/template/template_cache";

type BlockStateComputables = {
  readonly fullState: Computable<BlockStateInternalV3>;
};

function stringifyForDump(object: unknown): string {
  return JSON.stringify(object, (key, value) => {
    if (typeof value === "bigint") return resourceIdToString(value as OptionalAnyResourceId);
    else if (
      ArrayBuffer.isView(value) ||
      value instanceof Int8Array ||
      value instanceof Uint8Array ||
      value instanceof Uint8ClampedArray ||
      value instanceof Int16Array ||
      value instanceof Uint16Array ||
      value instanceof Int32Array ||
      value instanceof Uint32Array ||
      value instanceof Float32Array ||
      value instanceof Float64Array ||
      value instanceof BigInt64Array ||
      value instanceof BigUint64Array
    )
      return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64");
    else if (Buffer.isBuffer(value)) return value.toString("base64");

    return value;
  });
}

/** Data access object, to manipulate and read single opened (!) project data. */
export class Project {
  /** Data for the left panel, contain basic information about block status. */
  public readonly overview: ComputableStableDefined<ProjectOverview>;
  private readonly overviewLight: Computable<ProjectOverviewLight>;

  private readonly navigationStates = new NavigationStates();
  // null is set for deleted blocks
  private readonly blockComputables = new Map<string, BlockStateComputables | null>();

  private readonly blockFrontends = new Map<string, ComputableStableDefined<FrontendData>>();
  private readonly activeConfigs: Computable<unknown[]>;
  private readonly refreshLoopResult: Promise<void>;

  private readonly abortController = new AbortController();

  /** Tree change generation as of the snapshot currently on disk, or -1 when this session has
   * not written one. Compared against the tree's current generation to skip writing a mirror
   * that has not moved, which is what makes a project left open and idle go quiet. */
  private snapshotGeneration: number;

  /** When a snapshot was last attempted, for the periodic write's wall-clock gate.
   *
   * Zero, not the construction time, so the first write lands on the first maintenance pass
   * after the tree has settled rather than a full interval later. Sessions shorter than one
   * interval are the common case for a desktop app that is quit with a project still open, and
   * seeding this to now would leave every one of them with nothing on disk. Set on every
   * attempt, successful or not, so a persistently failing write retries at the interval rather
   * than on every pass of the loop. */
  private lastSnapshotAt = 0;

  private get destroyed() {
    return this.abortController.signal.aborted;
  }

  constructor(
    private readonly env: MiddleLayerEnvironment,
    public readonly id: ProjectId /* Project ID, exposed to outer consumers, who work with ML */,
    readonly rid: SignedResourceId /* Contains signature, not exposed outside middle layer. */,
    private readonly projectTree: SynchronizedTreeState,
    /** Whether this tree was seeded from a snapshot. When it was, the file on disk already
     * holds generation 0, so an idle warm reopen writes nothing at all. */
    restoredFromSnapshot: boolean = false,
  ) {
    this.snapshotGeneration = restoredFromSnapshot ? 0 : -1;
    this.overview = projectOverview(
      projectTree.entry(),
      this.navigationStates,
      env,
    ).withPreCalculatedValueTree();
    this.overviewLight = projectOverviewLight(projectTree.entry()).withPreCalculatedValueTree();
    this.refreshLoopResult = this.refreshLoop();
    this.refreshLoopResult.catch((err) => {
      env.logger.warn(new Error("Error during refresh loop", { cause: err })); // TODO (safe voiding for now)
    });
    this.activeConfigs = activeConfigs(projectTree.entry(), env);
  }

  get projectLockId(): string {
    return "project:" + this.id.toString();
  }

  /**
   * Periodic snapshot write, carried on the maintenance loop rather than a timer of its own.
   *
   * Gated on the tree having changed since the last snapshot, so a project left open and idle
   * writes once and then goes quiet, and on wall clock, so a project changing continuously
   * writes at most once per interval.
   */
  private async maybeWriteSnapshot(): Promise<void> {
    const store = this.env.treeSnapshots;
    if (store === undefined) return;

    const generation = this.projectTree.changeGeneration;
    if (generation === this.snapshotGeneration) return;
    if (Date.now() - this.lastSnapshotAt < this.env.ops.treeSnapshotOps.writeInterval) return;

    await this.writeSnapshot(store, generation);
  }

  /**
   * Starts the close-boundary snapshot and returns without waiting for the write.
   *
   * On top of the periodic write, since closing is a natural point to persist. Change-gated but
   * not interval-gated: rewriting a mirror that has not moved is pure waste, but a mirror that
   * has moved is worth keeping however recently the last write happened.
   *
   * The **capture is synchronous and happens here**, before the caller destroys the tree,
   * because destroying it invalidates it and a later capture would be refused. Only the encode
   * and the write are deferred: they are up to ten megabytes of work, and project switching
   * should not wait for them. Deferring is safe only because a capture is a copy rather than a
   * view of the tree.
   *
   * The returned promise never rejects. The caller is expected to keep it so it can be drained
   * at shutdown, not to await it here.
   */
  public snapshotOnClose(): Promise<void> {
    const store = this.env.treeSnapshots;
    if (store === undefined) return Promise.resolve();

    const generation = this.projectTree.changeGeneration;
    if (generation === this.snapshotGeneration) return Promise.resolve();

    let snapshot;
    try {
      snapshot = this.projectTree.capture(parseSignedResourceId(this.rid).signature);
    } catch (e: unknown) {
      this.env.logger.warn(
        new Error(`failed to capture tree snapshot for project ${this.id} on close`, { cause: e }),
      );
      return Promise.resolve();
    }

    this.lastSnapshotAt = Date.now();

    // Queued behind any in-flight periodic write rather than racing it. Both would land
    // atomically, but the loser would be a wasted encode of the same mirror.
    const previous = this.snapshotInFlight ?? Promise.resolve();
    const write = previous.then(async () => {
      if (this.snapshotGeneration >= generation) return; // the in-flight write covered it
      if (await store.write(this.rid, snapshot)) this.snapshotGeneration = generation;
    });

    this.snapshotInFlight = write.finally(() => {
      this.snapshotInFlight = undefined;
    });
    return this.snapshotInFlight;
  }

  /** In-flight snapshot write, if any. Both triggers can fire close together (the close write
   *  lands while the loop is mid-write), and encoding ten megabytes twice for the same mirror
   *  is worth avoiding. */
  private snapshotInFlight: Promise<void> | undefined;

  /** Serializes writes, and skips one that the in-flight write has already made redundant. */
  private async writeSnapshot(store: TreeSnapshotStore, generation: number): Promise<void> {
    // A loop, not a single check: with three or more callers, re-checking only once would let
    // a waiter install its own promise over another's and clear the field while that write is
    // still running. Two callers is the most that can happen today, so this is a guard against
    // the next caller rather than a live fix.
    while (this.snapshotInFlight !== undefined) {
      await this.snapshotInFlight;
      if (this.snapshotGeneration >= generation) return;
    }

    this.snapshotInFlight = this.captureAndWrite(store, generation).finally(() => {
      this.snapshotInFlight = undefined;
    });
    await this.snapshotInFlight;
  }

  /** Captures and writes, never throwing: a snapshot is an optimisation and must not fail
   *  whatever triggered it. */
  private async captureAndWrite(store: TreeSnapshotStore, generation: number): Promise<void> {
    // Recorded before the attempt and regardless of its outcome, so a failing disk is retried
    // once per interval instead of on every pass of the maintenance loop.
    this.lastSnapshotAt = Date.now();
    try {
      // The root's signature is the session witness a later open compares against.
      const snapshot = this.projectTree.capture(parseSignedResourceId(this.rid).signature);

      // Only a real write advances the change gate. Marking the generation persisted after a
      // failed write would tell both triggers the tree is already on disk, so one transient
      // I/O error would cost the rest of the session, close write included.
      if (await store.write(this.rid, snapshot)) this.snapshotGeneration = generation;
    } catch (e: unknown) {
      this.env.logger.warn(
        new Error(`failed to capture tree snapshot for project ${this.id}`, { cause: e }),
      );
    }
  }

  private async refreshLoop(): Promise<void> {
    let retryState: InfiniteRetryState | undefined;
    while (!this.destroyed) {
      try {
        await withProject(
          this.env.projectHelper,
          this.env.pl,
          this.rid,
          (prj) => {
            prj.doRefresh();
          },
          { name: "doRefresh", lockId: this.projectLockId },
        );
        await this.activeConfigs.getValue();
        await setTimeout(this.env.ops.projectRefreshInterval, undefined, {
          signal: this.abortController.signal,
        });

        await this.maybeWriteSnapshot();

        // Block computables housekeeping
        const overviewLight = await this.overviewLight.getValue();
        const existingBlocks = new Set(overviewLight.listOfBlocks);
        // Doing cleanup for deleted blocks
        for (const blockId of this.blockComputables.keys()) {
          if (!existingBlocks.has(blockId)) {
            const computable = this.blockComputables.get(blockId);
            if (computable !== undefined && computable !== null) computable.fullState.resetState();
            this.blockComputables.set(blockId, null);
          }
        }
        retryState = undefined;
      } catch (e: unknown) {
        // If we're destroyed, exit gracefully regardless of error type
        if (this.destroyed) break;

        if (isNotFoundError(e)) {
          this.env.logger.warn(
            "project refresh routine terminated, because project was externally deleted",
          );
          break;
        } else if (isTimeoutOrCancelError(e)) {
          // Timeout during normal operation, continue the loop
        } else {
          retryState = retryState
            ? nextInfiniteRetryState(retryState)
            : createInfiniteRetryState({
                type: "exponentialWithMaxDelayBackoff",
                initialDelay: 1000,
                maxDelay: 60_000,
                backoffMultiplier: 2,
                jitter: 0,
              });
          this.env.logger.error(
            new Error(`[refreshLoop] unexpected exception, retrying in ${retryState.nextDelay}ms`, {
              cause: e,
            }),
          );
          try {
            await setTimeout(retryState.nextDelay, undefined, {
              signal: this.abortController.signal,
            });
          } catch {
            // Aborted during retry delay, will exit via while condition or destroyed check
            break;
          }
        }
      }
    }
  }

  /**
   * Adds new block to the project.
   *
   * @param blockLabel block label / title visible to the user
   * @param blockPackSpec object describing the "block type", read more in the type docs
   * @param before id of the block to insert new block before
   * @param blockId internal id to be assigned for the block, this arg can be omitted
   *                 then, randomly generated UUID will be assigned automatically
   *
   * @return returns newly created block id
   * */
  public async addBlock(
    blockLabel: string,
    blockPackSpec: BlockPackSpecAny,
    before?: string,
    author: AuthorMarker | undefined = undefined,
    blockId: string = randomUUID(),
  ): Promise<string> {
    const preparedBp = await this.env.bpPreparer.prepare(blockPackSpec);
    const blockCfg = extractConfig(preparedBp.config);

    this.env.runtimeCapabilities.throwIfIncompatible(blockCfg.featureFlags);
    throwIfMissingServerCapabilities(this.env.pl, preparedBp.requiredCapabilities);

    // Pre-materialize template via cache (separate transaction(s))
    const cachedBp = await cacheBlockPackTemplate(this.env.pl, preparedBp);

    // Build NewBlockSpec based on model API version
    const newBlockSpec =
      blockCfg.modelAPIVersion === BLOCK_STORAGE_FACADE_VERSION
        ? { storageMode: "fromModel" as const, blockPack: cachedBp }
        : {
            storageMode: "legacy" as const,
            blockPack: cachedBp,
            legacyState: canonicalize({
              args: blockCfg.initialArgs,
              uiState: blockCfg.initialUiState,
            })!,
          };

    await withProjectAuthored(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      author,
      (mut) => {
        return mut.addBlock(
          {
            id: blockId,
            label: blockLabel,
            renderingMode: blockCfg.renderingMode,
          },
          newBlockSpec,
          before,
        );
      },
      {
        retryOptions: {
          ...DefaultRetryOptions,
          backoffMultiplier: DefaultRetryOptions.backoffMultiplier * 1.1,
        },
        name: "addBlock",
        lockId: this.projectLockId,
      },
    );

    await this.projectTree.refreshState();

    return blockId;
  }

  /**
   * Duplicates an existing block by copying all its fields and state.
   * This method works at the mutator level for efficient block copying.
   *
   * @param originalBlockId id of the block to duplicate
   * @param before id of the block to insert new block before
   * @param author author marker for the duplication operation
   * @param newBlockId internal id to be assigned for the duplicated block,
   *                   if omitted, a randomly generated UUID will be assigned
   *
   * @return returns newly created block id
   * */
  public async duplicateBlock(
    originalBlockId: string,
    before?: string,
    author: AuthorMarker | undefined = undefined,
    newBlockId: string = randomUUID(),
  ): Promise<string> {
    await withProjectAuthored(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      author,
      (mut) => mut.duplicateBlock(originalBlockId, newBlockId, before),
      { name: "duplicateBlock", lockId: this.projectLockId },
    );
    await this.projectTree.refreshState();

    return newBlockId;
  }

  /**
   * Update block to new block pack, optionally resetting args and ui state to
   * initial values
   * */
  public async updateBlockPack(
    blockId: string,
    blockPackSpec: BlockPackSpecAny,
    resetArgs: boolean = false,
    author?: AuthorMarker,
  ): Promise<void> {
    const preparedBp = await this.env.bpPreparer.prepare(blockPackSpec);
    const blockCfg = extractConfig(preparedBp.config);

    this.env.runtimeCapabilities.throwIfIncompatible(blockCfg.featureFlags);
    throwIfMissingServerCapabilities(this.env.pl, preparedBp.requiredCapabilities);

    // Pre-materialize template via cache (separate transaction(s))
    const cachedBp = await cacheBlockPackTemplate(this.env.pl, preparedBp);

    // resetState signals to mutator to reset storage
    // For v2+ blocks: mutator gets initial storage directly via getInitialStorageInVM
    // For v1 blocks: we pass the legacy state format
    const resetState = resetArgs
      ? {
          state:
            blockCfg.modelAPIVersion === 1
              ? { args: blockCfg.initialArgs, uiState: blockCfg.initialUiState }
              : {},
        }
      : undefined;
    await withProjectAuthored(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      author,
      (mut) => mut.migrateBlockPack(blockId, cachedBp, resetState),
      { name: "updateBlockPack", lockId: this.projectLockId },
    );
    await this.projectTree.refreshState();
  }

  /** Deletes a block with all associated data. */
  public async deleteBlock(blockId: string, author?: AuthorMarker): Promise<void> {
    await withProjectAuthored(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      author,
      (mut) => mut.deleteBlock(blockId),
      { name: "deleteBlock", lockId: this.projectLockId },
    );
    this.navigationStates.deleteBlock(blockId);
    await this.projectTree.refreshState();
  }

  /**
   * Updates block order according to the given array of block ids.
   *
   * Provided array must contain exactly the same set of ids current project cosists of,
   * an error will be thrown instead.
   */
  public async reorderBlocks(blocks: string[], author?: AuthorMarker): Promise<void> {
    await withProjectAuthored(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      author,
      (mut) => {
        const currentStructure = mut.structure;
        if (currentStructure.groups.length !== 1)
          throw new Error("Unexpected project structure, non-singular block group");
        const currentGroup = currentStructure.groups[0];
        if (currentGroup.blocks.length !== blocks.length)
          throw new Error(`Length mismatch: ${currentGroup.blocks.length} !== ${blocks.length}`);
        if (new Set<string>(blocks).size !== blocks.length) throw new Error(`Repeated block ids`);
        const newStructure: ProjectStructure = {
          groups: [
            {
              id: currentGroup.id,
              label: currentGroup.label,
              blocks: blocks.map((blockId) => {
                const block = currentGroup.blocks.find((b) => b.id === blockId);
                if (block === undefined) throw new Error(`Can't find block: ${blockId}`);
                return block;
              }),
            },
          ],
        };
        mut.updateStructure(newStructure);
      },
      { name: "reorderBlocks", lockId: this.projectLockId },
    );
    await this.projectTree.refreshState();
  }

  /**
   * Renders production part of the block starting all connected heavy computations.
   * Upstream blocks of the specified block will be started automatically if in
   * stale state.
   * */
  public async runBlock(blockId: string): Promise<void> {
    await withProject(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      (mut) => mut.renderProduction([blockId], true),
      { name: "runBlock", lockId: this.projectLockId },
    );
    await this.projectTree.refreshState();
  }

  /**
   * Stops the block if it is running by destroying its production state. All
   * its downstreams will also be destroyed or moved to limbo if already
   * calculated.
   * */
  public async stopBlock(blockId: string): Promise<void> {
    await withProject(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      (mut) => mut.stopProduction(blockId),
      { name: "stopBlock", lockId: this.projectLockId },
    );
    await this.projectTree.refreshState();
  }

  /**
   * @deprecated Use mutateBlockStorage() for V3 blocks.
   * Sets block args, and changes whole project state accordingly.
   * Along with setting arguments one can specify author marker, that will be
   * transactionally associated with the block, to facilitate conflict resolution
   * in collaborative editing scenario.
   * */
  public async setBlockArgs(blockId: string, args: unknown, author?: AuthorMarker) {
    await withProjectAuthored(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      author,
      (mut) => {
        const state = mut.mergeBlockState(blockId, { args });
        mut.setStates([{ modelAPIVersion: 1, blockId, state }]);
      },
      { name: "setBlockArgs", lockId: this.projectLockId },
    );
    await this.projectTree.refreshState();
  }

  /**
   * @deprecated Use mutateBlockStorage() for V3 blocks.
   * Sets ui block state associated with the block.
   * Along with setting arguments one can specify author marker, that will be
   * transactionally associated with the block, to facilitate conflict resolution
   * in collaborative editing scenario.
   * */
  public async setUiState(blockId: string, uiState: unknown, author?: AuthorMarker) {
    await withProjectAuthored(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      author,
      (mut) => {
        const state = mut.mergeBlockState(blockId, { uiState });
        mut.setStates([{ modelAPIVersion: 1, blockId, state }]);
      },
      { name: "setUiState", lockId: this.projectLockId },
    );
    await this.projectTree.refreshState();
  }

  /**
   * @deprecated Use mutateBlockStorage() for V3 blocks.
   * Sets block args and ui state, and changes the whole project state accordingly.
   * Along with setting arguments one can specify author marker, that will be
   * transactionally associated with the block, to facilitate conflict resolution
   * in collaborative editing scenario.
   * */
  public async setBlockArgsAndUiState(
    blockId: string,
    args: unknown, // keep for v1/v2 compatibility
    uiState: unknown, // keep for v1/v2 compatibility
    author?: AuthorMarker,
  ) {
    // Normalize to unified state format { args, uiState } for v1/v2 blocks
    const state = { args, uiState };
    await withProjectAuthored(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      author,
      (mut) => {
        mut.setStates([{ modelAPIVersion: 1, blockId, state }]);
      },
      { name: "setBlockArgsAndUiState", lockId: this.projectLockId },
    );
    await this.projectTree.refreshState();
  }

  /**
   * Sets navigation state.
   * */
  //
  public async setNavigationState(blockId: string, state: NavigationState): Promise<void> {
    this.navigationStates.setState(blockId, state);
  }

  /**
   * Mutates block storage for Model API v3 blocks.
   * Applies a storage operation (e.g., 'update-data') which triggers
   * args derivation (args(data) and prerunArgs(data)).
   * The derived args are stored atomically with the data.
   *
   * @param blockId - The block ID
   * @param payload - Storage mutation payload with operation and value
   * @param author - Optional author marker for collaborative editing
   */
  public async mutateBlockStorage(
    blockId: string,
    payload: { operation: string; value: unknown },
    author?: AuthorMarker,
  ) {
    await withProjectAuthored(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      author,
      (mut) => mut.setStates([{ modelAPIVersion: 2, blockId, payload }]),
      { name: "mutateBlockStorage", lockId: this.projectLockId },
    );
    await this.projectTree.refreshState();
  }

  /** Update block settings */
  public async setBlockSettings(blockId: string, newValue: BlockSettings) {
    await withProjectAuthored(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      undefined,
      (mut) => {
        mut.setBlockSettings(blockId, newValue);
      },
      { name: "setBlockSettings" },
    );
    await this.projectTree.refreshState();
  }

  /**
   * Sets raw block storage content directly.
   * This bypasses all normalization and VM transformations.
   *
   * @param blockId The block to set storage for
   * @param rawStorageJson Raw storage as JSON string
   */
  public async setBlockStorageRaw(blockId: string, rawStorageJson: string): Promise<void> {
    await withProjectAuthored(
      this.env.projectHelper,
      this.env.pl,
      this.rid,
      undefined,
      (mut) => {
        mut.setBlockStorageRaw(blockId, rawStorageJson);
      },
      { name: "setBlockStorageRaw" },
    );
    await this.projectTree.refreshState();
  }

  /** Resets arguments and ui state of the block to initial state */
  public async resetBlockArgsAndUiState(blockId: string, author?: AuthorMarker): Promise<void> {
    await this.env.pl.withWriteTx("BlockInputsReset", async (tx) => {
      // reading default arg values from block pack
      const bpHolderRid = ensureSignedResourceIdNotNull(
        (await tx.getField(field(this.rid, projectFieldName(blockId, "blockPack")))).value,
      );
      const bpRid = ensureSignedResourceIdNotNull(
        (await tx.getField(field(bpHolderRid, Pl.HolderRefField))).value,
      );
      const bpData = await tx.getResourceData(bpRid, false);
      const config = extractConfig(cachedDeserialize<BlockPackInfo>(notEmpty(bpData.data)).config);

      await withProjectAuthored(
        this.env.projectHelper,
        tx,
        this.rid,
        author,
        (prj) => {
          if (config.modelAPIVersion === BLOCK_STORAGE_FACADE_VERSION) {
            // V2+: Reset to initial storage via VM
            prj.resetToInitialStorage(blockId);
          } else {
            // V1: Use legacy state format
            const initialState = { args: config.initialArgs, uiState: config.initialUiState };
            prj.setStates([{ modelAPIVersion: 1, blockId, state: initialState }]);
          }
        },
        { name: "resetBlockArgsAndUiState", lockId: this.projectLockId },
      );
      await tx.commit();
    });
    await this.projectTree.refreshState();
  }

  private getBlockComputables(blockId: string): BlockStateComputables {
    const cached = this.blockComputables.get(blockId);
    if (cached === null) throw new Error(`Block ${blockId} is deleted`);
    if (cached === undefined) {
      // state consists of inputs (args + ui state) and outputs
      const outputs = blockOutputs(this.projectTree.entry(), blockId, this.env);
      const fullState = Computable.make(
        (ctx) => {
          return {
            parameters: getBlockParameters(this.projectTree.entry(), blockId, ctx),
            outputs,
            navigationState: this.navigationStates.getState(blockId),
            overview: this.overview,
          };
        },
        {
          postprocessValue: (v) => {
            const blockOverview = v.overview?.blocks?.find((b) => b.id == blockId);
            const sdkVersion = blockOverview?.sdkVersion;
            const storageDebugView = blockOverview?.storageDebugView;
            const toString = sdkVersion && shouldStillUseStringErrors(sdkVersion);
            const newOutputs =
              toString && v.outputs !== undefined ? convertErrorsToStrings(v.outputs) : v.outputs;

            return {
              ...v.parameters,
              outputs: newOutputs,
              navigationState: v.navigationState,
              storageDebugView,
            } as BlockStateInternalV3;
          },
        },
      );

      const computables: BlockStateComputables = {
        fullState: fullState.withPreCalculatedValueTree(),
      };

      this.blockComputables.set(blockId, computables);

      return computables;
    }
    return cached;
  }

  /**
   * Returns a computable, that can be used to retrieve and watch full block state,
   * including outputs, arguments, ui state.
   * */
  public getBlockState(blockId: string): Computable<BlockStateInternalV3> {
    return this.getBlockComputables(blockId).fullState;
  }

  /**
   * Returns a computable, that can be used to retrieve and watch path of the
   * folder containing frontend code.
   * */
  public getBlockFrontend(blockId: string): ComputableStableDefined<FrontendData> {
    const cached = this.blockFrontends.get(blockId);
    if (cached === undefined) {
      const fd = frontendData(
        this.projectTree.entry(),
        blockId,
        this.env,
      ).withPreCalculatedValueTree();
      this.blockFrontends.set(blockId, fd);
      return fd;
    }
    return cached;
  }

  /** Called by middle layer on close */
  public async destroy(): Promise<void> {
    // terminating the project service loop
    this.abortController.abort();
    try {
      await this.refreshLoopResult;
    } catch (e: unknown) {
      // Error was already logged in the constructor's catch handler, but log again for context
      this.env.logger.warn(
        new Error("Refresh loop had terminated with error before destroy", { cause: e }),
      );
    }

    // terminating the synchronized project tree
    try {
      await this.projectTree.terminate();
    } catch (e: unknown) {
      // TODO: SynchronizedTreeState.terminate() can throw if mainLoop had an error before termination
      // Log error but continue cleanup - we must clean up remaining resources
      this.env.logger.warn(new Error("Project tree termination failed", { cause: e }));
    }

    // the following will deregister all external resource holders, like
    // downloaded files, running uploads and alike
    this.overview.resetState();
    this.blockFrontends.forEach((c) => c.resetState());
    this.blockComputables.forEach((c) => {
      if (c !== null) c.fullState.resetState();
    });
    this.activeConfigs.resetState();
  }

  /** @deprecated */
  public async destroyAndAwaitTermination(): Promise<void> {
    await this.destroy();
  }

  public dumpState(): ExtendedResourceData[] {
    return this.projectTree.dumpState();
  }

  public static async init(
    env: MiddleLayerEnvironment,
    id: ProjectId,
    rid: SignedResourceId,
  ): Promise<Project> {
    // Applying migrations to the project resource, if needed
    await applyProjectMigrations(env.pl, rid);

    // Doing a no-op mutation to apply all migration and schema fixes
    await withProject(env.projectHelper, env.pl, rid, (_) => {}, { name: "init" });

    // Loading project tree, warm from a persisted mirror when one is usable
    const { tree: projectTree, restored } = await loadProjectTree(env, rid);

    if (env.ops.debugOps.dumpInitialTreeState) {
      const state = projectTree.dumpState();
      state.sort((a, b) => (b.data?.byteLength ?? 0) - (a.data?.byteLength ?? 0));
      const stats = treeDumpStats(state);
      await fs.writeFile(`${resourceIdToString(rid)}.json`, stringifyForDump(state));
      await fs.writeFile(`${resourceIdToString(rid)}.stats.json`, stringifyForDump(stats));
    }

    return new Project(env, id, rid, projectTree, restored);
  }
}

/**
 * Opens the project tree, seeded from a persisted mirror when there is a usable one.
 *
 * Carries the fail-safe: if the restored tree fails its first refresh on authentication,
 * permission or an inconsistency, the snapshot is deleted and the open is retried cold. Once,
 * and only for that first refresh, so a genuinely dead session still surfaces as itself rather
 * than being masked as a slow open.
 *
 * The fail-safe is what bounds every case the cache key does not cover: a rotated master
 * secret, a revoked grant, a snapshot valid in itself but no longer matching what the backend
 * will serve. Without it, an explicit-root tree propagates the refresh failure rather than
 * healing, so the project would fail to open on every attempt until someone deleted the cache
 * directory by hand.
 */
async function loadProjectTree(
  env: MiddleLayerEnvironment,
  rid: SignedResourceId,
): Promise<{ tree: SynchronizedTreeState; restored: boolean }> {
  const treeOps = {
    ...env.ops.defaultTreeOptions,
    pruning: projectTreePruning(env.logger),
    fieldFilter: projectTreeFieldFilter(),
    traverseStopRules: projectTreeTraverseStopRules(),
  };
  const cold = async () => ({
    tree: await SynchronizedTreeState.init(env.pl, rid, treeOps, env.logger),
    restored: false,
  });

  const store = env.treeSnapshots;
  if (store === undefined) return await cold();

  const snapshot = await store.read(rid);
  if (!snapshot.ok) {
    env.logger.info(`project tree opening cold, snapshot miss: ${snapshot.miss}`);
    return await cold();
  }

  try {
    const tree = await SynchronizedTreeState.init(
      env.pl,
      rid,
      { ...treeOps, restoreFrom: snapshot.tree },
      env.logger,
    );

    // Read from the tree rather than assumed: a snapshot can be handed over and still be
    // refused, in which case this open was cold and the file on disk does not describe the
    // tree we now hold.
    const restored = tree.wasRestoredFromSnapshot;
    if (restored) store.noteRestored();
    else env.logger.info("project tree opening cold: the snapshot was not applied");

    return { tree, restored };
  } catch (e: unknown) {
    // Retry cold on ANY failure of the warm open, not only on the classified ones. A cold open
    // is exactly what this code did before snapshots existed, so the retry cannot regress
    // anything, whereas rethrowing here leaves a project that fails to open on every attempt
    // until someone deletes the cache directory by hand: the snapshot stays on disk and the
    // next open restores it and fails the same way. That is the outcome this fail-safe exists
    // to prevent, and the error classes that can reach here are not a closed set.
    env.logger.warn(
      new Error("restored project tree failed its first refresh, opening cold", { cause: e }),
    );

    // Deleting is reserved for failures that implicate the snapshot itself. Anything else (a
    // timeout, a dropped connection) says nothing about the file, and throwing it away would
    // destroy a mirror that is still good, along with the evidence a later signature refresh
    // would repair.
    if (isSnapshotFailsafeError(e)) await store.discard(rid);

    return await cold();
  }
}

/** The failures that implicate the snapshot rather than the link or the session: a rotated
 *  master secret, a revoked grant, or state the tree cannot reconcile. Only these delete the
 *  file; every other failure still falls back to a cold open, it just keeps the file.
 *
 *  The cause chain is walked because a wrapper anywhere between the tree update and here would
 *  otherwise silently disarm the inconsistency arm. `isUnauthenticated` and `isPermissionDenied`
 *  do their own one-level unwrapping. */
export function isSnapshotFailsafeError(e: unknown): boolean {
  if (isUnauthenticated(e) || isPermissionDenied(e)) return true;
  for (let cause: unknown = e, depth = 0; cause !== undefined && depth < 8; depth++) {
    if (cause instanceof TreeStateUpdateError) return true;
    cause = (cause as { cause?: unknown } | null)?.cause;
  }
  return false;
}

export function projectTreePruning(logger: MiLogger): PruningFunction {
  return (r: ExtendedResourceData): FieldData[] => {
    if (r.fields.length > 1000)
      logger.warn(
        `resource with excessive field count: type=${r.type.name} id=${r.id} fields=${r.fields.length}` +
          ` names=[${r.fields
            .slice(0, 10)
            .map((f) => f.name)
            .join(", ")}, ...]`,
      );
    if (r.type.name.startsWith("StreamWorkdir/")) return [];
    switch (r.type.name) {
      case "BlockPackCustom":
        return r.fields.filter((f) => f.name !== "template");
      case "UserProject":
        return r.fields.filter((f) => !f.name.startsWith("__serviceTemplate"));
      case "Blob":
        return [];
      default:
        return r.fields;
    }
  };
}

/** ResourceTree analogue of projectTreePruning() used by modern backend path. */
export function projectTreeFieldFilter(): Filter {
  return treeFilter.not(
    treeFilter.or(
      // StreamWorkdir/* — pruned entirely
      treeFilter.resourceTypeMatch("^StreamWorkdir/"),
      // BlockPackCustom: drop `template`
      treeFilter.and(
        treeFilter.resourceTypeEq("BlockPackCustom"),
        treeFilter.fieldNameEq("template"),
      ),
      // UserProject: drop `__serviceTemplate*`
      treeFilter.and(
        treeFilter.resourceTypeEq("UserProject"),
        treeFilter.fieldNameMatch("^__serviceTemplate"),
      ),
      // Blob — pruned entirely
      treeFilter.resourceTypeEq("Blob"),
    ),
  );
}

/**
 * Stop-rules for the ResourceTree backend path.
 *
 * Mirrors every case of DefaultFinalResourceDataPredicate in the same order.
 * The mapping from BFS predicate logic to backend filter conditions:
 *
 *   BFS predicate always true
 *     → no readyOrDuplicateOrError guard; backend stops traversal unconditionally.
 *
 *   BFS predicate: readyOrDuplicateOrError(r)
 *     → readyOrDuplicateOrError(): stops when resource_ready_for_calculation,
 *       is_duplicate, or has_errors is true — exactly mirroring the BFS predicate.
 *
 *   BFS predicate: readyAndHasAllOutputsFilled(r)
 *     → isFinal(true) + allOutputsFinal(true).
 *
 *   BFS predicate always false (UserProject, Projects, ClientRoot)
 *     → no entry here; traversal always continues into them.
 */
export function projectTreeTraverseStopRules(): Filter {
  return treeFilter.or(
    // BFS: readyOrDuplicateOrError(r) AND (fields===undefined OR error OR stream.value===downloadable.value).
    // datactl sets stream field to point at the same resource as downloadable once processing
    // is complete, so stream.value===downloadable.value is the "done" signal.
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.StreamManager),
      treeFilter.readyOrDuplicateOrError(),
    ),
    // BFS: readyOrDuplicateOrError(r)
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.StdMap),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.StdMapSlash),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.EphStdMap),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.PFrame),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.ParquetChunk),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BContext),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BlockPackCustom),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BinaryMap),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BinaryValue),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BlobMap),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BResolveSingle),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BResolveSingleNoResult),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.BQueryResult),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.TengoTemplate),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.TengoLib),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.SoftwareInfo),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeEq(ResourceTypeName.Dummy),
      treeFilter.readyOrDuplicateOrError(),
    ),
    // BFS: r.type.version === "1" → always true → no state guard needed
    treeFilter.resourceTypeEq(ResourceTypeName.JsonResourceError),
    // BFS: return true (unconditionally) → no readyOrDuplicateOrError guard needed
    treeFilter.resourceTypeEq(ResourceTypeName.JsonObject),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonGzObject),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonString),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonArray),
    treeFilter.resourceTypeEq(ResourceTypeName.JsonNumber),
    treeFilter.resourceTypeEq(ResourceTypeName.BContextEnd),
    treeFilter.resourceTypeEq(ResourceTypeName.FrontendFromUrl),
    treeFilter.resourceTypeEq(ResourceTypeName.FrontendFromFolder),
    treeFilter.resourceTypeEq(ResourceTypeName.BObjectSpec),
    treeFilter.resourceTypeEq(ResourceTypeName.Blob),
    treeFilter.resourceTypeEq(ResourceTypeName.Null),
    treeFilter.resourceTypeEq(ResourceTypeName.Binary),
    treeFilter.resourceTypeEq(ResourceTypeName.LSProvider),
    treeFilter.resourceTypeEq(ResourceTypeName.WorkingDirectory),
    // BFS default branch: startsWith prefix → return true → no guard needed
    treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.Blob),
    treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.LS),
    treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.WorkingDirectory),
    treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.StorageSpaceAllocation),
    // BFS default branch: readyAndHasAllOutputsFilled → readyOrDuplicateOrError() + outputsLocked(true) + allOutputsFinal(true)
    treeFilter.and(
      treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.BlobUpload),
      treeFilter.readyOrDuplicateOrError(),
      treeFilter.outputsLocked(true),
      treeFilter.allOutputsFinal(true),
    ),
    treeFilter.and(
      treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.BlobIndex),
      treeFilter.readyOrDuplicateOrError(),
      treeFilter.outputsLocked(true),
      treeFilter.allOutputsFinal(true),
    ),
    // BFS default branch: readyOrDuplicateOrError
    treeFilter.and(
      treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.PColumnData),
      treeFilter.readyOrDuplicateOrError(),
    ),
    treeFilter.and(
      treeFilter.resourceTypeMatch("^" + ResourceTypePrefix.StreamWorkdir),
      treeFilter.readyOrDuplicateOrError(),
    ),
  );
}

/** Returns true if sdk version of the block is old and we need to convert
 * ErrorLike errors to strings like it was.
 * We need it for keeping old blocks and new UI compatibility. */
function shouldStillUseStringErrors(sdkVersion: string): boolean {
  return !isVersionGreater(sdkVersion, "1.26.0");
}

/** Checks if sdk version is greater that a target version. */
function isVersionGreater(sdkVersion: string, targetVersion: string): boolean {
  const version = sdkVersion.split(".").map(Number);
  const target = targetVersion.split(".").map(Number);

  return (
    version[0] > target[0] ||
    (version[0] === target[0] && version[1] > target[1]) ||
    (version[0] === target[0] && version[1] === target[1] && version[2] > target[2])
  );
}

/** Converts ErrorLike errors to strings in the outputs like it was in old ML versions. */
function convertErrorsToStrings(
  outputs: Record<string, ComputableValueOrErrors<unknown>>,
): Record<string, ComputableValueOrErrors<unknown>> {
  const result: Record<string, ComputableValueOrErrors<unknown>> = {};
  for (const [key, val] of Object.entries(outputs)) {
    if (val.ok) {
      result[key] = val;
      continue;
    }

    result[key] = {
      ok: false,
      errors: val.errors.map((e) => {
        if (typeof e === "string") {
          return e;
        } else if (e.type == "PlError" && e.fullMessage !== undefined) {
          return e.fullMessage;
        }
        return e.message;
      }),
      moreErrors: val.moreErrors,
    };
  }

  return result;
}

/** Throws when the connected backend doesn't advertise every capability the
 * block-pack requires (as declared in `meta.requiredCapabilities`).
 *
 * The matching set is the desktop's install gate moved server-side so both
 * the UI (`AddBlockModal`) and direct middle-layer callers (the MCP server's
 * `add_block` tool, programmatic block installs, tests) reject incompatible
 * blocks consistently. */
function throwIfMissingServerCapabilities(
  pl: PlClient,
  requiredCapabilities: readonly string[] | undefined,
): void {
  if (!requiredCapabilities || requiredCapabilities.length === 0) return;
  const advertised = (pl.serverInfo.capabilities ?? []) as readonly string[];
  const filterFn = (c: string) => !advertised.includes(c);
  if (!requiredCapabilities.some(filterFn)) return;
  const missing = requiredCapabilities.filter(filterFn);
  throw new Error(
    `Block cannot be added: connected backend does not advertise capabilities ` +
      `${JSON.stringify(missing)}. ` +
      `Backend advertises ${JSON.stringify(advertised)}. ` +
      `Upgrade the backend or remove the requirement from the block manifest.`,
  );
}
