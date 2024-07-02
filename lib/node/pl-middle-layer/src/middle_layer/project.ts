import { MiddleLayerEnvironment } from './middle_layer';
import {
  ensureResourceIdNotNull,
  field,
  isNotFoundError, Pl,
  ResourceId
} from '@milaboratory/pl-client-v2';
import { Computable, ComputableStableDefined } from '@milaboratory/computable';
import { projectOverview } from './project_overview';
import { BlockPackSpecAny } from '../model';
import { randomUUID } from 'node:crypto';
import { withProject, withProjectAuthored } from '../mutator/project';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { setTimeout } from 'node:timers/promises';
import { frontendData } from './frontend_path';
import { AuthorMarker, BlockState } from '@milaboratory/sdk-model';
import { blockArgsAndUiState, blockOutputs } from './block';
import { BlockArgsAndUiState, BlockOutputsBase } from '@milaboratory/sdk-ui';
import { FrontendData } from '../model/frontend';
import { projectFieldName } from '../model/project_model';
import { notEmpty } from '@milaboratory/ts-helpers';
import { BlockPackInfo } from '../model/block_pack';
import { ProjectOverview } from '@milaboratory/pl-middle-layer-model';
import { activeConfigs } from './active_cfg';

type BlockStateComputables = {
  readonly fullState: Computable<BlockState>;
  readonly argsAndUiState: Computable<BlockArgsAndUiState>;
  readonly outputs: ComputableStableDefined<BlockOutputsBase>;
}

/** Data access object, to manipulate and read single opened (!) project data. */
export class Project {
  /** Underlying pl resource id */
  public readonly rid: ResourceId;

  /** Data for the left panel, contain basic information about block status. */
  public readonly overview: ComputableStableDefined<ProjectOverview>;

  private readonly blockComputables = new Map<string, BlockStateComputables>();
  private readonly blockFrontends = new Map<string, ComputableStableDefined<FrontendData>>();
  private readonly activeConfigs: Computable<unknown[]>;
  private destroyed = false;
  private readonly refreshLoopResult: Promise<void>;

  constructor(private readonly env: MiddleLayerEnvironment,
              rid: ResourceId,
              private readonly projectTree: SynchronizedTreeState,
              overview: ComputableStableDefined<ProjectOverview>) {
    this.overview = overview;
    this.rid = rid;
    this.refreshLoopResult = this.refreshLoop();
    this.activeConfigs = activeConfigs(projectTree.entry(), env);
  }

  private async refreshLoop(): Promise<void> {
    while (!this.destroyed) {
      try {
        await withProject(this.env.pl, this.rid, prj => {
          prj.doRefresh(this.env.ops.stagingRenderingRate);
        });
        await this.activeConfigs.getValue();
      } catch (err: any) {
        if (isNotFoundError(err)) {
          console.warn('project refresh routine terminated, because project was externally deleted');
          break;
        } else
          console.error(err);
      }
      await setTimeout(this.env.ops.projectRefreshInterval);
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
  public async addBlock(blockLabel: string, blockPackSpec: BlockPackSpecAny,
                        before?: string, blockId: string = randomUUID()): Promise<string> {
    const preparedBp = await this.env.bpPreparer.prepare(blockPackSpec);
    const blockCfg = await this.env.bpPreparer.getBlockConfig(blockPackSpec);
    await withProject(this.env.pl, this.rid, mut =>
      mut.addBlock({ id: blockId, label: blockLabel, renderingMode: blockCfg.renderingMode },
        {
          args: JSON.stringify(blockCfg.initialArgs),
          blockPack: preparedBp
        }, before
      ));
    await this.projectTree.refreshState();

    return blockId;
  }

  /**
   * Update block to new block pack, optionally resetting args and ui state to
   * initial values
   * */
  public async updateBlock(blockId: string, blockPackSpec: BlockPackSpecAny,
                           resetArgs: boolean = false): Promise<void> {
    const preparedBp = await this.env.bpPreparer.prepare(blockPackSpec);
    const blockCfg = await this.env.bpPreparer.getBlockConfig(blockPackSpec);
    await withProject(this.env.pl, this.rid, mut =>
      mut.migrateBlockPack(blockId, preparedBp,
        resetArgs
          ? JSON.stringify(blockCfg.initialArgs)
          : undefined
      ));
    await this.projectTree.refreshState();
  }

  /** Deletes a block with all associated data. */
  public async deleteBlock(blockId: string) {
    await withProject(this.env.pl, this.rid, mut =>
      mut.deleteBlock(blockId));
    await this.projectTree.refreshState();
  }

  /**
   * Renders production part of the block starting all connected heavy computations.
   * Upstream blocks of the specified block will be started automatically if in
   * stale state.
   * */
  public async runBlock(blockId: string) {
    await withProject(this.env.pl, this.rid, mut =>
      mut.renderProduction([blockId], true));
    await this.projectTree.refreshState();
  }

  /**
   * Stops the block if it is running by destroying its production state. All
   * its downstreams will also be destroyed or moved to limbo if already
   * calculated.
   * */
  public async stopBlock(blockId: string) {
    await withProject(this.env.pl, this.rid, mut =>
      mut.stopProduction(blockId));
    await this.projectTree.refreshState();
  }

  /**
   * Sets block args, and changes whole project state accordingly.
   * Along with setting arguments one can specify author marker, that will be
   * transactionally associated with the block, to facilitate conflict resolution
   * in collaborative editing scenario.
   * */
  public async setBlockArgs(blockId: string, args: any, author?: AuthorMarker) {
    await withProjectAuthored(this.env.pl, this.rid, author, mut =>
      mut.setArgs([{ blockId, args: JSON.stringify(args) }]));
    await this.projectTree.refreshState();
  }

  /**
   * Sets ui block state associated with the block.
   * Along with setting arguments one can specify author marker, that will be
   * transactionally associated with the block, to facilitate conflict resolution
   * in collaborative editing scenario.
   * */
  public async setUiState(blockId: string, uiState: any, author?: AuthorMarker) {
    await withProjectAuthored(this.env.pl, this.rid, author, mut =>
      mut.setUiState(blockId, uiState));
    await this.projectTree.refreshState();
  }

  /**
   * Sets block args and ui state, and changes the whole project state accordingly.
   * Along with setting arguments one can specify author marker, that will be
   * transactionally associated with the block, to facilitate conflict resolution
   * in collaborative editing scenario.
   * */
  public async setBlockArgsAndUiState(blockId: string, args: any, uiState: any, author?: AuthorMarker) {
    await withProjectAuthored(this.env.pl, this.rid, author, mut => {
      mut.setArgs([{ blockId, args: JSON.stringify(args) }]);
      mut.setUiState(blockId, uiState);
    });
    await this.projectTree.refreshState();
  }

  /** Resets arguments and ui state of the block to initial state */
  public async resetBlockArgsAndUiState(blockId: string): Promise<void> {
    await this.env.pl.withWriteTx('BlockInputsReset', async tx => {
      // reading default arg values from block pack
      const bpHolderRid = ensureResourceIdNotNull(
        (await tx.getField(
          field(this.rid, projectFieldName(blockId, 'blockPack')
          ))).value);
      const bpRid = ensureResourceIdNotNull(
        (await tx.getField(field(bpHolderRid, Pl.HolderRefField))).value);
      const bpData = await tx.getResourceData(bpRid, false);
      const bpInfo = JSON.parse(Buffer.from(notEmpty(bpData.data)).toString('utf-8')) as BlockPackInfo;
      await withProject(tx, this.rid, prj => {
        prj.setArgs([{ blockId, args: JSON.stringify(bpInfo.config.initialArgs) }]);
        prj.setUiState(blockId, undefined);
      });
      await tx.commit();
    });
    await this.projectTree.refreshState();
  }

  private getBlockComputables(blockId: string): BlockStateComputables {
    const cached = this.blockComputables.get(blockId);
    if (cached === undefined) {
      // state consists of inputs (args + ui state) and outputs
      const argsAndUiState = blockArgsAndUiState(this.projectTree.entry(), blockId, this.env);
      const outputs = blockOutputs(this.projectTree.entry(), blockId, this.env);
      const fullState = Computable.make(() => ({
        argsAndUiState, outputs
      }), { postprocessValue: v => ({ ...v.argsAndUiState, outputs: v.outputs } as BlockState) });

      const computables: BlockStateComputables = {
        argsAndUiState: argsAndUiState.withPreCalculatedValueTree(),
        outputs: outputs.withPreCalculatedValueTree(),
        fullState: fullState.withPreCalculatedValueTree()
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
  public getBlockState(blockId: string): Computable<BlockState> {
    return this.getBlockComputables(blockId).fullState;
  }

  /** Returns a computable, that can be used to retrieve and watch block outputs. */
  public getBlockOutputs(blockId: string): ComputableStableDefined<BlockOutputsBase> {
    return this.getBlockComputables(blockId).outputs;
  }

  /**
   * Returns a computable, that can be used to retrieve and watch block args and
   * ui state.
   * */
  public getBlockArgsAndUiState(blockId: string): Computable<BlockArgsAndUiState> {
    return this.getBlockComputables(blockId).argsAndUiState;
  }

  /**
   * Returns a computable, that can be used to retrieve and watch path of the
   * folder containing frontend code.
   * */
  public getBlockFrontend(blockId: string): ComputableStableDefined<FrontendData> {
    const cached = this.blockFrontends.get(blockId);
    if (cached === undefined) {
      const fd = frontendData(this.projectTree.entry(), blockId, this.env)
        .withPreCalculatedValueTree();
      this.blockFrontends.set(blockId, fd);
      return fd;
    }
    return cached;
  }

  /** Called by middle layer on close */
  public destroy() {
    // the following will deregister all external resource holders, like
    // downloaded files, running uploads and alike
    this.overview.resetState();
    this.blockFrontends.forEach(c => c.resetState());
    this.blockComputables.forEach(c => {
      c.argsAndUiState.resetState();
      c.outputs.resetState();
      c.fullState.resetState();
    });

    this.destroyed = true;
  }

  public async destroyAndAwaitTermination(): Promise<void> {
    this.destroy();
    await this.refreshLoopResult;
    await this.projectTree.awaitSyncLoopTermination();
  }

  public static async init(env: MiddleLayerEnvironment, rid: ResourceId): Promise<Project> {
    const projectTree = await SynchronizedTreeState.init(env.pl, rid, env.ops.defaultTreeOptions);
    const overview = projectOverview(projectTree.entry(), env).withPreCalculatedValueTree();
    return new Project(env, rid, projectTree, overview);
  }
}
