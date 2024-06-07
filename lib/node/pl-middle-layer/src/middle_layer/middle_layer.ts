import {
  field,
  isNullResourceId,
  PlClient,
  ResourceId,
  toGlobalResourceId
} from '@milaboratory/pl-client-v2';
import { createProjectList, ProjectListEntry, ProjectsField, ProjectsResourceType } from './project_list';
import { TemporalSynchronizedTreeOps, TreeAndComputableU } from './types';
import { ProjectMeta } from '../model/project_model';
import { createProject, loadProject, withProject } from '../mutator/project';
import { ComputableSU } from '@milaboratory/computable';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { projectOverview, ProjectOverview } from './project_overview';
import { BlockPackPreparer } from '../mutator/block-pack/block_pack';
import { BlockPackSpecAny } from '../model/block_pack_spec';
import { randomUUID } from 'node:crypto';

export type MiddleLayerOps = {
  defaultTreeOptions: TemporalSynchronizedTreeOps;
}

export const DefaultMiddleLayerOps: MiddleLayerOps = {
  defaultTreeOptions: {
    pollingInterval: 350,
    stopPollingDelay: 2500
  }
};

/** Main entry point for the frontend */
export class MiddleLayer {
  private readonly projectListTree: SynchronizedTreeState;
  public readonly projectList: ComputableSU<ProjectListEntry[]>;
  private readonly bpPreparer: BlockPackPreparer;

  private constructor(
    private readonly pl: PlClient,
    private readonly projects: ResourceId,
    private readonly localSecret: string,
    private readonly ops: MiddleLayerOps = DefaultMiddleLayerOps
  ) {
    const projectListTC = createProjectList(pl, projects, ops.defaultTreeOptions);
    this.projectListTree = projectListTC.tree;
    this.projectList = projectListTC.computable;
    this.bpPreparer = new BlockPackPreparer(localSecret);
  }

  //
  // Project List Manipulation
  //

  public async addProject(id: string, meta: ProjectMeta): Promise<ResourceId> {
    return await this.pl.withWriteTx('MLCreateProject', async tx => {
      const prj = createProject(tx, meta);
      tx.createField(field(this.projects, id), 'Dynamic', prj);
      await tx.commit();
      return await toGlobalResourceId(prj);
    });
  }

  public async removeProject(id: string): Promise<void> {
    await this.pl.withWriteTx('MLRemoveProject', async tx => {
      tx.removeField(field(this.projects, id));
      await tx.commit();
    });
  }

  //
  // Projects
  //

  private readonly projectOverviews = new Map<ResourceId, TreeAndComputableU<ProjectOverview>>();

  public openProject(rid: ResourceId) {
    if (this.projectOverviews.has(rid))
      throw new Error(`Project ${rid} already opened`);
    const tree = new SynchronizedTreeState(this.pl, rid, this.ops.defaultTreeOptions);
    const overview = projectOverview(tree.entry());
    this.projectOverviews.set(rid, { tree, computable: overview });
  }

  public closeProject(rid: ResourceId) {
    const tc = this.projectOverviews.get(rid);
    if (tc === undefined)
      throw new Error(`Project ${rid} not found among opened projects`);
    this.projectOverviews.delete(rid);
    // the following will deregister all external resource holders, like
    // downloaded files, running uploads and alike
    tc.computable.resetState();
  }

  public getProjectOverview(rid: ResourceId): ComputableSU<ProjectOverview> {
    const tc = this.projectOverviews.get(rid);
    if (tc === undefined)
      throw new Error(`Project ${rid} not found among opened projects`);
    return tc.computable;
  }

  public async addBlock(prj: ResourceId, blockName: string, bp: BlockPackSpecAny,
                        blockId: string = randomUUID(), after?: string): Promise<string> {
    const prepared = await this.bpPreparer.prepare(bp);
    const blockCfg = await this.bpPreparer.getBlockConfig(bp);
    await withProject(this.pl, prj, mut => {
      mut.addBlock({ id: blockId, name: blockName, renderingMode: blockCfg.renderingMode },
        {
          inputs: JSON.stringify(blockCfg.initialArgs),
          blockPack: prepared
        }, after
      );
    });
    return blockId;
  }

  public async setBlockArgs(prj: ResourceId, blockId: string, args: any) {
    await withProject(this.pl, prj, mut => {
      mut.setInputs([{ blockId, inputs: JSON.stringify(args) }]);
    });
  }

  public async renderBlock(prj: ResourceId, blockId: string) {
    await withProject(this.pl, prj, mut => {
      mut.renderProduction([blockId], true);
    });
  }

  public static async init(pl: PlClient, localSecret: string): Promise<MiddleLayer> {
    const projects = await pl.withWriteTx('MLInitialization', async tx => {
      const projectsField = field(tx.clientRoot, ProjectsField);
      tx.createField(projectsField, 'Dynamic');
      const projectsFieldData = await tx.getField(projectsField);
      if (isNullResourceId(projectsFieldData.value)) {
        const projects = tx.createEphemeral(ProjectsResourceType);
        tx.lock(projects);

        tx.setField(projectsField, projects);

        await tx.commit();

        return await projects.globalId;
      } else {
        return projectsFieldData.value;
      }
    });
    return new MiddleLayer(pl, projects, localSecret);
  }
}

