import { field, isNullResourceId, PlClient, ResourceId, toGlobalResourceId } from '@milaboratory/pl-client-v2';
import { createProjectList, ProjectListEntry, ProjectsField, ProjectsResourceType } from './project_list';
import { ProjectMeta } from '../model/project_model';
import { createProject } from '../mutator/project';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { BlockPackPreparer } from '../mutator/block-pack/block_pack';
import { createDownloadUrlDriver, DownloadUrlDriver } from '@milaboratory/pl-drivers';
import { ConsoleLoggerAdapter } from '@milaboratory/ts-helpers';
import { ComputableStableDefined, WatchableValue } from '@milaboratory/computable';
import { ProjectImpl } from './project';
import { DefaultMiddleLayerOps, MiddleLayerOps, MiddleLayerOpsConstructor } from '../ops';
import { MiddleLayer } from '../middle_layer';

export interface MiddleLayerEnvironment {
  readonly pl: PlClient;
  readonly frontendDownloadDriver: DownloadUrlDriver;
  readonly ops: MiddleLayerOps;
  readonly bpPreparer: BlockPackPreparer;
}

/** Main entry point for the frontend */
export class MiddleLayerImpl implements MiddleLayer {
  private readonly pl: PlClient;

  private constructor(
    private readonly env: MiddleLayerEnvironment,
    private readonly projectListResourceId: ResourceId,
    private readonly openedProjectsList: WatchableValue<ResourceId[]>,
    private readonly projectListTree: SynchronizedTreeState,
    public readonly projectList: ComputableStableDefined<ProjectListEntry[]>
  ) {
    this.pl = this.env.pl;
  }

  //
  // Project List Manipulation
  //

  async createProject(id: string, meta: ProjectMeta): Promise<ResourceId> {
    return await this.pl.withWriteTx('MLCreateProject', async tx => {
      const prj = createProject(tx, meta);
      tx.createField(field(this.projectListResourceId, id), 'Dynamic', prj);
      await tx.commit();
      return await toGlobalResourceId(prj);
    });
  }

  async deleteProject(id: string): Promise<void> {
    await this.pl.withWriteTx('MLRemoveProject', async tx => {
      tx.removeField(field(this.projectListResourceId, id));
      await tx.commit();
    });
  }

  //
  // Projects
  //

  private readonly projects = new Map<ResourceId, ProjectImpl>();

  async openProject(rid: ResourceId) {
    if (this.projects.has(rid))
      throw new Error(`Project ${rid} already opened`);
    this.projects.set(rid, await ProjectImpl.init(this.env, rid));
    this.openedProjectsList.setValue([...this.projects.keys()]);
  }

  closeProject(rid: ResourceId) {
    const prj = this.projects.get(rid);
    if (prj === undefined)
      throw new Error(`Project ${rid} not found among opened projects`);
    this.projects.delete(rid);
    prj.destroy();
    this.openedProjectsList.setValue([...this.projects.keys()]);
  }

  getOpenedProject(rid: ResourceId): ProjectImpl {
    const prj = this.projects.get(rid);
    if (prj === undefined)
      throw new Error(`Project ${rid} not found among opened projects`);
    return prj;
  }

  close() {
    this.projects.forEach(prj => prj.destroy());
  }

  public static async init(pl: PlClient, _ops: MiddleLayerOpsConstructor): Promise<MiddleLayerImpl> {
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

    const frontendDownloadDriver = createDownloadUrlDriver(pl, new ConsoleLoggerAdapter(),
      ops.frontendDownloadPath);
    const bpPreparer = new BlockPackPreparer(ops.localSecret);
    const env: MiddleLayerEnvironment = { pl, ops, bpPreparer, frontendDownloadDriver };

    const openedProjects = new WatchableValue<ResourceId[]>([]);
    const projectListTC = await createProjectList(pl, projects, openedProjects, env);

    return new MiddleLayerImpl(env, projects, openedProjects, projectListTC.tree, projectListTC.computable);
  }
}

