import type { MiddleLayerEnvironment } from './middle_layer';
import type {
  FieldData,
  OptionalAnyResourceId,
  ResourceId,
} from '@milaboratories/pl-client';
import {
  DefaultRetryOptions,
  ensureResourceIdNotNull,
  field,
  isNotFoundError,
  isTimeoutOrCancelError,
  Pl,
  resourceIdToString,
} from '@milaboratories/pl-client';
import type { ComputableStableDefined, ComputableValueOrErrors } from '@milaboratories/computable';
import { Computable } from '@milaboratories/computable';
import { projectOverview } from './project_overview';
import type { BlockPackSpecAny } from '../model';
import { randomUUID } from 'node:crypto';
import { withProject, withProjectAuthored } from '../mutator/project';
import type { ExtendedResourceData } from '@milaboratories/pl-tree';
import { SynchronizedTreeState, treeDumpStats } from '@milaboratories/pl-tree';
import { setTimeout } from 'node:timers/promises';
import { frontendData } from './frontend_path';
import type { NavigationState } from '@milaboratories/pl-model-common';
import { getBlockParameters, blockOutputs } from './block';
import type { FrontendData } from '../model/frontend';
import type { ProjectStructure } from '../model/project_model';
import { projectFieldName } from '../model/project_model';
import { cachedDeserialize, notEmpty } from '@milaboratories/ts-helpers';
import type { BlockPackInfo } from '../model/block_pack';
import type {
  ProjectOverview,
  AuthorMarker,
  BlockSettings,
  BlockStateInternalV3,
} from '@milaboratories/pl-model-middle-layer';
import { activeConfigs } from './active_cfg';
import { NavigationStates } from './navigation_states';
import { extractConfig } from '@platforma-sdk/model';
import fs from 'node:fs/promises';
import canonicalize from 'canonicalize';
import type { ProjectOverviewLight } from './project_overview_light';
import { projectOverviewLight } from './project_overview_light';
import { applyProjectMigrations } from '../mutator/migration';

type BlockStateComputables = {
  readonly fullState: Computable<BlockStateInternalV3>;
};

function stringifyForDump(object: unknown): string {
  return JSON.stringify(object, (key, value) => {
    if (typeof value === 'bigint')
      return resourceIdToString(value as OptionalAnyResourceId);
    else if (
      ArrayBuffer.isView(value)
      || value instanceof Int8Array
      || value instanceof Uint8Array
      || value instanceof Uint8ClampedArray
      || value instanceof Int16Array
      || value instanceof Uint16Array
      || value instanceof Int32Array
      || value instanceof Uint32Array
      || value instanceof Float32Array
      || value instanceof Float64Array
      || value instanceof BigInt64Array
      || value instanceof BigUint64Array
    )
      return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
    else if (Buffer.isBuffer(value))
      return value.toString('base64');

    return value;
  });
}

/** Data access object, to manipulate and read single opened (!) project data. */
export class Project {
  /** Underlying pl resource id */
  public readonly rid: ResourceId;

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

  private get destroyed() {
    return this.abortController.signal.aborted;
  }

  constructor(
    private readonly env: MiddleLayerEnvironment,
    rid: ResourceId,
    private readonly projectTree: SynchronizedTreeState,
  ) {
    this.overview = projectOverview(
      projectTree.entry(),
      this.navigationStates,
      env,
    ).withPreCalculatedValueTree();
    this.overviewLight = projectOverviewLight(projectTree.entry())
      .withPreCalculatedValueTree();
    this.rid = rid;
    this.refreshLoopResult = this.refreshLoop();
    this.refreshLoopResult.catch((err) => {
      env.logger.warn(new Error('Error during refresh loop', { cause: err })); // TODO (safe voiding for now)
    });
    this.activeConfigs = activeConfigs(projectTree.entry(), env);
  }

  get projectLockId(): string {
    return 'project:' + this.rid.toString();
  }

  private async refreshLoop(): Promise<void> {
    while (!this.destroyed) {
      try {
        await withProject(this.env.projectHelper, this.env.pl, this.rid, (prj) => {
          prj.doRefresh(this.env.ops.stagingRenderingRate);
        }, { name: 'doRefresh', lockId: this.projectLockId });
        await this.activeConfigs.getValue();
        await setTimeout(this.env.ops.projectRefreshInterval, this.abortController.signal);

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
      } catch (e: unknown) {
        // If we're destroyed, exit gracefully regardless of error type
        if (this.destroyed) {
          // Log just in case, to help with debugging if something unexpected happens during shutdown
          this.env.logger.warn(new Error('Error during refresh loop shutdown', { cause: e }));
          break;
        }

        if (isNotFoundError(e)) {
          console.warn(
            'project refresh routine terminated, because project was externally deleted',
          );
          break;
        } else if (isTimeoutOrCancelError(e)) {
          // Timeout during normal operation, continue the loop
        } else {
          // TODO: This stops the refresh loop permanently, leaving the project broken.
          // Need to decide how to handle this case.
          throw new Error('Unexpected exception', { cause: e });
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
    const blockCfgContainer = await this.env.bpPreparer.getBlockConfigContainer(blockPackSpec);
    const blockCfg = extractConfig(blockCfgContainer); // full content of this var should never be persisted

    // Determine initial state and args based on block config version (discriminated union)
    let initialState: unknown;

    if (blockCfg.configVersion === 4) {
      // V4 block (BlockModelV3) - derive args from state using config.args() callback
      initialState = blockCfg.initialData;
    } else {
      // V3 and earlier (BlockModel v1) - use initialArgs directly
      // derivedArgs = blockCfg.initialArgs;
      initialState = { args: blockCfg.initialArgs, uiState: blockCfg.initialUiState };
    }

    await withProjectAuthored(this.env.projectHelper, this.env.pl, this.rid, author, (mut) => {
      return mut.addBlock(
        {
          id: blockId,
          label: blockLabel,
          renderingMode: blockCfg.renderingMode,
        },
        {
          state: canonicalize(initialState) ?? '{}',
          blockPack: preparedBp,
        },
        before,
      );
    },
    {
      retryOptions: {
        ...DefaultRetryOptions,
        backoffMultiplier: DefaultRetryOptions.backoffMultiplier * 1.1,
      },
      name: 'addBlock',
      lockId: this.projectLockId,
    });

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
    await withProjectAuthored(this.env.projectHelper, this.env.pl, this.rid, author, (mut) =>
      mut.duplicateBlock(originalBlockId, newBlockId, before),
    { name: 'duplicateBlock', lockId: this.projectLockId },
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
    const blockCfg = extractConfig(await this.env.bpPreparer.getBlockConfigContainer(blockPackSpec));
    // Get initial state based on config version
    const initialState = blockCfg.configVersion === 4
      ? blockCfg.initialData
      : { args: blockCfg.initialArgs, uiState: blockCfg.initialUiState };
    await withProjectAuthored(this.env.projectHelper, this.env.pl, this.rid, author, (mut) =>
      mut.migrateBlockPack(
        blockId,
        preparedBp,
        resetArgs ? { state: initialState } : undefined,
      ),
    { name: 'updateBlockPack', lockId: this.projectLockId },
    );
    await this.projectTree.refreshState();
  }

  /** Deletes a block with all associated data. */
  public async deleteBlock(blockId: string, author?: AuthorMarker): Promise<void> {
    await withProjectAuthored(this.env.projectHelper, this.env.pl, this.rid, author, (mut) => mut.deleteBlock(blockId), { name: 'deleteBlock', lockId: this.projectLockId });
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
    await withProjectAuthored(this.env.projectHelper, this.env.pl, this.rid, author, (mut) => {
      const currentStructure = mut.structure;
      if (currentStructure.groups.length !== 1)
        throw new Error('Unexpected project structure, non-singular block group');
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
    }, { name: 'reorderBlocks', lockId: this.projectLockId });
    await this.projectTree.refreshState();
  }

  /**
   * Renders production part of the block starting all connected heavy computations.
   * Upstream blocks of the specified block will be started automatically if in
   * stale state.
   * */
  public async runBlock(blockId: string): Promise<void> {
    await withProject(this.env.projectHelper, this.env.pl, this.rid, (mut) => mut.renderProduction([blockId], true), { name: 'runBlock', lockId: this.projectLockId });
    await this.projectTree.refreshState();
  }

  /**
   * Stops the block if it is running by destroying its production state. All
   * its downstreams will also be destroyed or moved to limbo if already
   * calculated.
   * */
  public async stopBlock(blockId: string): Promise<void> {
    await withProject(this.env.projectHelper, this.env.pl, this.rid, (mut) => mut.stopProduction(blockId), { name: 'stopBlock', lockId: this.projectLockId });
    await this.projectTree.refreshState();
  }

  /**
   * @deprecated use setState instead
   * Sets block args, and changes whole project state accordingly.
   * Along with setting arguments one can specify author marker, that will be
   * transactionally associated with the block, to facilitate conflict resolution
   * in collaborative editing scenario.
   * */
  public async setBlockArgs(blockId: string, args: unknown, author?: AuthorMarker) {
    await withProjectAuthored(this.env.projectHelper, this.env.pl, this.rid, author, (mut) => {
      const state = mut.mergeBlockState(blockId, { args });
      mut.setStates([{ blockId, state }]);
    }, { name: 'setBlockArgs', lockId: this.projectLockId });
    await this.projectTree.refreshState();
  }

  /**
   * @deprecated use setState instead.
   * Sets ui block state associated with the block.
   * Along with setting arguments one can specify author marker, that will be
   * transactionally associated with the block, to facilitate conflict resolution
   * in collaborative editing scenario.
   * */
  public async setUiState(blockId: string, uiState: unknown, author?: AuthorMarker) {
    await withProjectAuthored(this.env.projectHelper, this.env.pl, this.rid, author, (mut) => {
      const state = mut.mergeBlockState(blockId, { uiState });
      mut.setStates([{ blockId, state }]);
    }, { name: 'setUiState', lockId: this.projectLockId });
    await this.projectTree.refreshState();
  }

  /**
   * @deprecated use setState instead
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
    await withProjectAuthored(this.env.projectHelper, this.env.pl, this.rid, author, (mut) => {
      mut.setStates([{ blockId, state }]);
    }, { name: 'setBlockArgsAndUiState', lockId: this.projectLockId });
    await this.projectTree.refreshState();
  }

  /**
   * Sets navigation state.
   * */
  // eslint-disable-next-line @typescript-eslint/require-await
  public async setNavigationState(blockId: string, state: NavigationState): Promise<void> {
    this.navigationStates.setState(blockId, state);
  }

  /**
   * Sets the unified block data for Model API v3 blocks.
   * This triggers args derivation (args(data) and preRunArgs(data)).
   * The derived args are stored atomically with the data.
   *
   * @param blockId - The block ID
   * @param data - The new unified block input data
   * @param author - Optional author marker for collaborative editing
   */
  public async setData(blockId: string, data: unknown, author?: AuthorMarker) {
    await withProjectAuthored(this.env.projectHelper, this.env.pl, this.rid, author, (mut) =>
      mut.setStates([{ blockId, state: data }]),
    { name: 'setData', lockId: this.projectLockId });
    await this.projectTree.refreshState();
  }

  /** Update block settings */
  public async setBlockSettings(blockId: string, newValue: BlockSettings) {
    await withProjectAuthored(this.env.projectHelper, this.env.pl, this.rid, undefined, (mut) => {
      mut.setBlockSettings(blockId, newValue);
    }, { name: 'setBlockSettings' });
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
    await withProjectAuthored(this.env.projectHelper, this.env.pl, this.rid, undefined, (mut) => {
      mut.setBlockStorageRaw(blockId, rawStorageJson);
    }, { name: 'setBlockStorageRaw' });
    await this.projectTree.refreshState();
  }

  /** Resets arguments and ui state of the block to initial state */
  public async resetBlockArgsAndUiState(blockId: string, author?: AuthorMarker): Promise<void> {
    await this.env.pl.withWriteTx('BlockInputsReset', async (tx) => {
      // reading default arg values from block pack
      const bpHolderRid = ensureResourceIdNotNull(
        (await tx.getField(field(this.rid, projectFieldName(blockId, 'blockPack')))).value,
      );
      const bpRid = ensureResourceIdNotNull(
        (await tx.getField(field(bpHolderRid, Pl.HolderRefField))).value,
      );
      const bpData = await tx.getResourceData(bpRid, false);
      const config = extractConfig(cachedDeserialize<BlockPackInfo>(notEmpty(bpData.data)).config);
      // Get initial state based on config version
      const initialState = config.configVersion === 4
        ? config.initialData
        : { args: config.initialArgs, uiState: config.initialUiState };
      await withProjectAuthored(this.env.projectHelper, tx, this.rid, author, (prj) => {
        prj.setStates([{ blockId, state: initialState }]);
      }, { name: 'resetBlockArgsAndUiState', lockId: this.projectLockId });
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
            const sdkVersion = v.overview?.blocks?.find((b) => b.id == blockId)?.sdkVersion;
            const toString = sdkVersion && shouldStillUseStringErrors(sdkVersion);
            const newOutputs = toString && v.outputs !== undefined
              ? convertErrorsToStrings(v.outputs)
              : v.outputs;

            return {
              ...v.parameters,
              outputs: newOutputs,
              navigationState: v.navigationState,
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
      this.env.logger.warn(new Error('Refresh loop had terminated with error before destroy', { cause: e }));
    }

    // terminating the synchronized project tree
    try {
      await this.projectTree.terminate();
    } catch (e: unknown) {
      // TODO: SynchronizedTreeState.terminate() can throw if mainLoop had an error before termination
      // Log error but continue cleanup - we must clean up remaining resources
      this.env.logger.warn(new Error('Project tree termination failed', { cause: e }));
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

  public static async init(env: MiddleLayerEnvironment, rid: ResourceId): Promise<Project> {
    // Applying migrations to the project resource, if needed
    await applyProjectMigrations(env.pl, rid);

    // Doing a no-op mutation to apply all migration and schema fixes
    await withProject(env.projectHelper, env.pl, rid, (_) => {}, { name: 'init' });

    // Loading project tree
    const projectTree = await SynchronizedTreeState.init(
      env.pl,
      rid,
      {
        ...env.ops.defaultTreeOptions,
        pruning: projectTreePruning,
      },
      env.logger,
    );

    if (env.ops.debugOps.dumpInitialTreeState) {
      const state = projectTree.dumpState();
      state.sort((a, b) => (b.data?.byteLength ?? 0) - (a.data?.byteLength ?? 0));
      const stats = treeDumpStats(state);
      await fs.writeFile(`${resourceIdToString(rid)}.json`, stringifyForDump(state));
      await fs.writeFile(`${resourceIdToString(rid)}.stats.json`, stringifyForDump(stats));
    }

    return new Project(env, rid, projectTree);
  }
}

function projectTreePruning(r: ExtendedResourceData): FieldData[] {
  // console.log(
  //   JSON.stringify(
  //     { ...r, kv: [], data: undefined } satisfies ExtendedResourceData,
  //     (_, v) => {
  //       if (typeof v === 'bigint') return v.toString();
  //       return v;
  //     }
  //   )
  // );
  if (r.type.name.startsWith('StreamWorkdir/'))
    return [];
  switch (r.type.name) {
    case 'BlockPackCustom':
      return r.fields.filter((f) => f.name !== 'template');
    case 'UserProject':
      return r.fields.filter((f) => !f.name.startsWith('__serviceTemplate'));
    case 'Blob':
      return [];
    default:
      return r.fields;
  }
}

/** Returns true if sdk version of the block is old and we need to convert
 * ErrorLike errors to strings like it was.
 * We need it for keeping old blocks and new UI compatibility. */
function shouldStillUseStringErrors(sdkVersion: string): boolean {
  return !isVersionGreater(sdkVersion, '1.26.0');
}

/** Checks if sdk version is greater that a target version. */
function isVersionGreater(sdkVersion: string, targetVersion: string): boolean {
  const version = sdkVersion.split('.').map(Number);
  const target = targetVersion.split('.').map(Number);

  return (
    version[0] > target[0]
    || (version[0] === target[0] && version[1] > target[1])
    || (version[0] === target[0] && version[1] === target[1] && version[2] > target[2])
  );
};

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
        if (typeof e === 'string') {
          return e;
        } else if (e.type == 'PlError' && e.fullMessage !== undefined) {
          return e.fullMessage;
        }
        return e.message;
      }),
      moreErrors: val.moreErrors,
    };
  }

  return result;
}
