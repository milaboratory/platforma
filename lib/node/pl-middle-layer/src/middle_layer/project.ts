import { MiddleLayerEnvironment } from './middle_layer';
import { isNotFoundError, ResourceId } from '@milaboratory/pl-client-v2';
import { Computable, ComputableStableDefined } from '@milaboratory/computable';
import { projectOverview, ProjectOverview } from './project_overview';
import { BlockPackSpecAny } from '../model/block_pack_spec';
import { randomUUID } from 'node:crypto';
import { withProject } from '../mutator/project';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { AuthorMarker } from '../model/project_model';
import { blockState, FullBlockState } from './block';
import { setTimeout } from 'node:timers/promises';
import { frontendPath } from './frontend_path';

export class Project {
  private readonly blockStates = new Map<string, Computable<FullBlockState>>();
  private readonly blockFrontends = new Map<string, ComputableStableDefined<string>>();
  private destroyed = false;
  private refreshLoopResult: Promise<void>;

  constructor(private readonly env: MiddleLayerEnvironment,
              public readonly rid: ResourceId,
              private readonly tree: SynchronizedTreeState,
              public readonly overview: ComputableStableDefined<ProjectOverview>) {
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
      await setTimeout(this.env.ops.projectRefreshDelay);
    }
  }

  public async addBlock(blockName: string, bp: BlockPackSpecAny,
                        blockId: string = randomUUID(), after?: string): Promise<string> {
    const prepared = await this.env.bpPreparer.prepare(bp);
    const blockCfg = await this.env.bpPreparer.getBlockConfig(bp);
    await withProject(this.env.pl, this.rid, mut =>
      mut.addBlock({ id: blockId, name: blockName, renderingMode: blockCfg.renderingMode },
        {
          inputs: JSON.stringify(blockCfg.initialArgs),
          blockPack: prepared
        }, after
      ));
    return blockId;
  }

  public async setBlockArgs(blockId: string, args: any, author?: AuthorMarker) {
    await withProject(this.env.pl, this.rid, mut =>
      mut.setArgs([{ blockId, inputs: JSON.stringify(args) }], author));
  }

  public async runBlock(blockId: string) {
    await withProject(this.env.pl, this.rid, mut =>
      mut.renderProduction([blockId], true));
  }

  public getBlockState(blockId: string): Computable<FullBlockState> {
    const cached = this.blockStates.get(blockId);
    if (cached === undefined) {
      const state = blockState(this.tree.entry(), blockId, this.env);
      this.blockStates.set(blockId, state);
      return state;
    }
    return cached;
  }

  public getBlockFrontend(blockId: string): ComputableStableDefined<string> {
    const cached = this.blockFrontends.get(blockId);
    if (cached === undefined) {
      const path = frontendPath(this.tree.entry(), blockId, this.env);
      this.blockFrontends.set(blockId, path);
      return path;
    }
    return cached;
  }

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
