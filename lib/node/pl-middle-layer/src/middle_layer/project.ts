import { MiddleLayerEnvironment } from './middle_layer';
import { isNotFoundError, ResourceId } from '@milaboratory/pl-client-v2';
import { Computable, ComputableStableDefined } from '@milaboratory/computable';
import { projectOverview } from './project_overview';
import { BlockPackSpecAny } from '../model';
import { randomUUID } from 'node:crypto';
import { withProject, withProjectAuthored } from '../mutator/project';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { blockState } from './block';
import { setTimeout } from 'node:timers/promises';
import { frontendPath } from './frontend_path';
import { AuthorMarker, BlockState, ProjectOverview } from '@milaboratory/sdk-model';

/** Data access object, to manipulate and read single opened (!) project data. */
export class Project {
  /** Underlying pl resource id */
  public readonly rid: ResourceId;

  /** Data for the left panel, contain basic information about block status. */
  public readonly overview: ComputableStableDefined<ProjectOverview>;

  private readonly blockStates = new Map<string, Computable<BlockState>>();
  private readonly blockFrontends = new Map<string, ComputableStableDefined<string>>();
  private destroyed = false;
  private refreshLoopResult: Promise<void>;

  constructor(private readonly env: MiddleLayerEnvironment,
              rid: ResourceId,
              private readonly tree: SynchronizedTreeState,
              overview: ComputableStableDefined<ProjectOverview>) {
    this.overview = overview;
    this.rid = rid;
    this.refreshLoopResult = this.refreshLoop();
  }

  private async refreshLoop(): Promise<void> {
    while (!this.destroyed) {
      try {
        await withProject(this.env.pl, this.rid, prj => {
          prj.doRefresh(this.env.ops.stagingRenderingRate);
        });
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
    const prepared = await this.env.bpPreparer.prepare(blockPackSpec);
    const blockCfg = await this.env.bpPreparer.getBlockConfig(blockPackSpec);
    await withProject(this.env.pl, this.rid, mut =>
      mut.addBlock({ id: blockId, label: blockLabel, renderingMode: blockCfg.renderingMode },
        {
          args: JSON.stringify(blockCfg.initialArgs),
          blockPack: prepared
        }, before
      ));
    return blockId;
  }

  /** Deletes a block with all associated data. */
  async deleteBlock(blockId: string) {
    await withProject(this.env.pl, this.rid, mut =>
      mut.deleteBlock(blockId));
  }

  /** Renders production part of the block starting all connected heavy computations.
   * Upstream blocks of the specified block will be started automatically if in
   * stale state. */
  async runBlock(blockId: string) {
    await withProject(this.env.pl, this.rid, mut =>
      mut.renderProduction([blockId], true));
  }

  /** Sets block args, and changes whole project state accordingly.
   * Along with setting arguments one can specify author marker, that will be
   * transactionally associated with the block, to facilitate conflict resolution
   * in collaborative editing scenario. */
  async setBlockArgs(blockId: string, args: any, author?: AuthorMarker) {
    await withProjectAuthored(this.env.pl, this.rid, author, mut =>
      mut.setArgs([{ blockId, args: JSON.stringify(args) }]));
  }

  /** Sets ui block state associated with the block.
   * Along with setting arguments one can specify author marker, that will be
   * transactionally associated with the block, to facilitate conflict resolution
   * in collaborative editing scenario. */
  async setUiState(blockId: string, uiState: any, author?: AuthorMarker) {
    await withProjectAuthored(this.env.pl, this.rid, author, mut =>
      mut.setUiState(blockId, uiState));
  }

  /** Sets block args and ui state, and changes the whole project state accordingly.
   * Along with setting arguments one can specify author marker, that will be
   * transactionally associated with the block, to facilitate conflict resolution
   * in collaborative editing scenario. */
  async setBlockArgsAndUiState(blockId: string, args: any, uiState: any, author?: AuthorMarker) {
    await withProjectAuthored(this.env.pl, this.rid, author, mut => {
      mut.setArgs([{ blockId, args: JSON.stringify(args) }]);
      mut.setUiState(blockId, uiState);
    });
  }

  /** Returns a computable, that can be used to retrieve and watch full block state,
   * including outputs, arguments, ui state, and ongoing computation status flags. */
  public getBlockState(blockId: string): Computable<BlockState> {
    const cached = this.blockStates.get(blockId);
    if (cached === undefined) {
      const state = blockState(this.tree.entry(), blockId, this.env);
      this.blockStates.set(blockId, state);
      return state;
    }
    return cached;
  }

  /** Returns a computable, that can be used to retrieve and watch path of the
   * folder containing frontend code. */
  public getBlockFrontend(blockId: string): ComputableStableDefined<string> {
    const cached = this.blockFrontends.get(blockId);
    if (cached === undefined) {
      const path = frontendPath(this.tree.entry(), blockId, this.env);
      this.blockFrontends.set(blockId, path);
      return path;
    }
    return cached;
  }

  /** Called by middle layer on close */
  public destroy() {
    // the following will deregister all external resource holders, like
    // downloaded files, running uploads and alike
    this.overview.resetState();
    this.blockStates.forEach(c => c.resetState());
    this.blockFrontends.forEach(c => c.resetState());
    this.destroyed = true;
  }

  public static async init(env: MiddleLayerEnvironment, rid: ResourceId): Promise<Project> {
    const projectTree = await SynchronizedTreeState.init(env.pl, rid, env.ops.defaultTreeOptions);
    const overview = projectOverview(projectTree.entry(), env);
    return new Project(env, rid, projectTree, overview);
  }
}
