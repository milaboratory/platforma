import { MiddleLayerEnvironment } from './middle_layer';
import { isNotFoundError, ResourceId } from '@milaboratory/pl-client-v2';
import { Computable, ComputableStableDefined } from '@milaboratory/computable';
import { projectOverview, ProjectOverview } from './project_overview';
import { BlockPackSpecAny } from '../model/block_pack_spec';
import { randomUUID } from 'node:crypto';
import { withProject, withProjectAuthored } from '../mutator/project';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { AuthorMarker } from '../model/project_model';
import { blockState, FullBlockState } from './block';
import { setTimeout } from 'node:timers/promises';
import { frontendPath } from './frontend_path';
import { Project } from '../project';

export class ProjectImpl implements Project {
  private readonly blockStates = new Map<string, Computable<FullBlockState>>();
  private readonly blockFrontends = new Map<string, ComputableStableDefined<string>>();
  private destroyed = false;
  private refreshLoopResult: Promise<void>;

  constructor(private readonly env: MiddleLayerEnvironment,
              readonly rid: ResourceId,
              private readonly tree: SynchronizedTreeState,
              readonly overview: ComputableStableDefined<ProjectOverview>) {
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

  async addBlock(blockLabel: string, blockPackSpec: BlockPackSpecAny,
                 blockId: string = randomUUID(), after?: string): Promise<string> {
    const prepared = await this.env.bpPreparer.prepare(blockPackSpec);
    const blockCfg = await this.env.bpPreparer.getBlockConfig(blockPackSpec);
    await withProject(this.env.pl, this.rid, mut =>
      mut.addBlock({ id: blockId, name: blockLabel, renderingMode: blockCfg.renderingMode },
        {
          inputs: JSON.stringify(blockCfg.initialArgs),
          blockPack: prepared
        }, after
      ));
    return blockId;
  }

  async setBlockArgs(blockId: string, args: any, author?: AuthorMarker) {
    await withProjectAuthored(this.env.pl, this.rid, author, mut =>
      mut.setArgs([{ blockId, inputs: JSON.stringify(args) }]));
  }

  async setUiState(blockId: string, uiState: any, author?: AuthorMarker) {
    await withProjectAuthored(this.env.pl, this.rid, author, mut =>
      mut.setUiState(blockId, uiState));
  }

  async setBlockArgsAndUiState(blockId: string, args: any, uiState: any, author?: AuthorMarker) {
    await withProjectAuthored(this.env.pl, this.rid, author, mut => {
      mut.setArgs([{ blockId, inputs: JSON.stringify(args) }]);
      mut.setUiState(blockId, uiState);
    });
  }

  async runBlock(blockId: string) {
    await withProject(this.env.pl, this.rid, mut =>
      mut.renderProduction([blockId], true));
  }

  getBlockState(blockId: string): Computable<FullBlockState> {
    const cached = this.blockStates.get(blockId);
    if (cached === undefined) {
      const state = blockState(this.tree.entry(), blockId, this.env);
      this.blockStates.set(blockId, state);
      return state;
    }
    return cached;
  }

  getBlockFrontend(blockId: string): ComputableStableDefined<string> {
    const cached = this.blockFrontends.get(blockId);
    if (cached === undefined) {
      const path = frontendPath(this.tree.entry(), blockId, this.env);
      this.blockFrontends.set(blockId, path);
      return path;
    }
    return cached;
  }

  destroy() {
    // the following will deregister all external resource holders, like
    // downloaded files, running uploads and alike
    this.overview.resetState();
    this.blockStates.forEach(c => c.resetState());
    this.blockFrontends.forEach(c => c.resetState());
    this.destroyed = true;
  }

  public static async init(env: MiddleLayerEnvironment, rid: ResourceId): Promise<ProjectImpl> {
    const projectTree = await SynchronizedTreeState.init(env.pl, rid, env.ops.defaultTreeOptions);
    const overview = projectOverview(projectTree.entry(), env);
    return new ProjectImpl(env, rid, projectTree, overview);
  }
}
