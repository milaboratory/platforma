import {
  field,
  isNullResourceId,
  PlClient,
  ResourceId,
  toGlobalResourceId
} from '@milaboratory/pl-client-v2';
import { createProjectList, ProjectListEntry, ProjectsField, ProjectsResourceType } from './project_list';
import { TemporalSynchronizedTreeOps } from './types';
import { ProjectMeta } from '../model/project_model';
import { createProject } from '../mutator/project';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { BlockPackPreparer } from '../mutator/block-pack/block_pack';
import { createDownloadUrlDriver, DownloadUrlDriver } from '@milaboratory/pl-drivers';
import { ConsoleLoggerAdapter } from '@milaboratory/ts-helpers';
import { ComputableStableDefined } from '@milaboratory/computable';
import { Project } from './project';

export type MiddleLayerOps = {
  readonly defaultTreeOptions: TemporalSynchronizedTreeOps;
  readonly projectRefreshDelay: number;
  readonly stagingRenderingRate: number;
  readonly localSecret: string,
  readonly frontendDownloadPath: string;
}

export const DefaultMiddleLayerOps: Pick<MiddleLayerOps,
  'defaultTreeOptions' | 'projectRefreshDelay' | 'stagingRenderingRate'> = {
  defaultTreeOptions: {
    pollingInterval: 350,
    stopPollingDelay: 2500
  },
  projectRefreshDelay: 700,
  stagingRenderingRate: 5
};

export type MiddleLayerOpsConstructor =
  Omit<MiddleLayerOps, keyof typeof DefaultMiddleLayerOps>
  & Partial<typeof DefaultMiddleLayerOps>

export interface MiddleLayerEnvironment {
  readonly pl: PlClient;
  readonly frontendDownloadDriver: DownloadUrlDriver;
  readonly ops: MiddleLayerOps;
  readonly bpPreparer: BlockPackPreparer;
}

/** Main entry point for the frontend */
export class MiddleLayer {
  private readonly bpPreparer: BlockPackPreparer;
  private readonly frontendDownloadDriver: DownloadUrlDriver;
  private readonly env: MiddleLayerEnvironment;

  private constructor(
    private readonly pl: PlClient,
    private readonly projectsRId: ResourceId,
    private readonly projectListTree: SynchronizedTreeState,
    public readonly projectList: ComputableStableDefined<ProjectListEntry[]>,
    private readonly ops: MiddleLayerOps
  ) {
    this.bpPreparer = new BlockPackPreparer(ops.localSecret);
    this.frontendDownloadDriver = createDownloadUrlDriver(this.pl, new ConsoleLoggerAdapter(), this.ops.frontendDownloadPath);
    this.env = {
      pl,
      ops,
      bpPreparer: this.bpPreparer,
      frontendDownloadDriver: this.frontendDownloadDriver
    };
  }

  //
  // Project List Manipulation
  //

  public async createProject(id: string, meta: ProjectMeta): Promise<ResourceId> {
    return await this.pl.withWriteTx('MLCreateProject', async tx => {
      const prj = createProject(tx, meta);
      tx.createField(field(this.projectsRId, id), 'Dynamic', prj);
      await tx.commit();
      return await toGlobalResourceId(prj);
    });
  }

  public async deleteProject(id: string): Promise<void> {
    await this.pl.withWriteTx('MLRemoveProject', async tx => {
      tx.removeField(field(this.projectsRId, id));
      await tx.commit();
    });
  }

  //
  // Projects
  //

  private readonly projects = new Map<ResourceId, Project>();

  public async openProject(rid: ResourceId) {
    if (this.projects.has(rid))
      throw new Error(`Project ${rid} already opened`);
    this.projects.set(rid, await Project.init(this.env, rid));
  }

  public closeProject(rid: ResourceId) {
    const prj = this.projects.get(rid);
    if (prj === undefined)
      throw new Error(`Project ${rid} not found among opened projects`);
    this.projects.delete(rid);
    prj.destroy();
  }

  public getProject(rid: ResourceId): Project {
    const prj = this.projects.get(rid);
    if (prj === undefined)
      throw new Error(`Project ${rid} not found among opened projects`);
    return prj;
  }

  public close() {
    this.projects.forEach(prj => prj.destroy());
  }

  public static async init(pl: PlClient, _ops: MiddleLayerOpsConstructor): Promise<MiddleLayer> {
    const ops: MiddleLayerOps = { ...DefaultMiddleLayerOps, ..._ops };
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

    const projectListTC = await createProjectList(pl, projects, ops.defaultTreeOptions);

    return new MiddleLayer(pl, projects, projectListTC.tree, projectListTC.computable, ops);
  }
}

