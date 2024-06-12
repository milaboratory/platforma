import { field, isNullResourceId, PlClient, ResourceId, toGlobalResourceId } from '@milaboratory/pl-client-v2';
import { createProjectList, ProjectsField, ProjectsResourceType } from './project_list';
import { ProjectMeta } from '../model/project_model';
import { createProject } from '../mutator/project';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { BlockPackPreparer } from '../mutator/block-pack/block_pack';
import { createDownloadUrlDriver, DownloadUrlDriver } from '@milaboratory/pl-drivers';
import { ConsoleLoggerAdapter } from '@milaboratory/ts-helpers';
import { ComputableStableDefined, WatchableValue } from '@milaboratory/computable';
import { Project } from './project';
import { DefaultMiddleLayerOps, MiddleLayerOps, MiddleLayerOpsConstructor } from './ops';
import { ProjectListEntry } from './models';
import { randomUUID } from 'node:crypto';

export interface MiddleLayerEnvironment {
  readonly pl: PlClient;
  readonly frontendDownloadDriver: DownloadUrlDriver;
  readonly ops: MiddleLayerOps;
  readonly bpPreparer: BlockPackPreparer;
  readonly localSecret: string;
}

/**
 * Main access object to work with pl from UI.
 *
 * It implements an abstraction layer of projects and blocks.
 *
 * As a main entry point inside the pl, this object uses a resource attached
 * via the {@link ProjectsField} to the pl client's root, this resource
 * contains project list.
 *
 * Read about alternative roots, if isolated project lists (working environments)
 * are required.
 * */
export class MiddleLayer {
  private readonly pl: PlClient;

  /** Contains a reactive list of projects along with their meta information. */
  public readonly projectList: ComputableStableDefined<ProjectListEntry[]>;

  private constructor(
    private readonly env: MiddleLayerEnvironment,
    private readonly projectListResourceId: ResourceId,
    private readonly openedProjectsList: WatchableValue<ResourceId[]>,
    private readonly projectListTree: SynchronizedTreeState,
    projectList: ComputableStableDefined<ProjectListEntry[]>
  ) {
    this.projectList = projectList;
    this.pl = this.env.pl;
  }

  //
  // Project List Manipulation
  //

  /** Creates a project with initial state and adds it to project list. */
  public async createProject(meta: ProjectMeta, id: string = randomUUID()): Promise<ResourceId> {
    return await this.pl.withWriteTx('MLCreateProject', async tx => {
      const prj = createProject(tx, meta);
      tx.createField(field(this.projectListResourceId, id), 'Dynamic', prj);
      await tx.commit();
      return await toGlobalResourceId(prj);
    });
  }

  /** Permanently deletes project from the project list, this will result in
   * destruction of all attached objects, like files, analysis results etc. */
  public async deleteProject(id: string): Promise<void> {
    await this.pl.withWriteTx('MLRemoveProject', async tx => {
      tx.removeField(field(this.projectListResourceId, id));
      await tx.commit();
    });
  }

  //
  // Projects
  //

  private readonly openedProjectsByRid = new Map<ResourceId, Project>();

  private async projectIdToResourceId(id: string): Promise<ResourceId> {
    return await this.pl.withReadTx('Project id to resource id', async tx => {
      const rid = (await tx.getField(field(this.projectListResourceId, id))).value;
      if (isNullResourceId(rid))
        throw new Error('Unexpected project list structure.');
      return rid;
    });
  }

  private async ensureProjectRid(id: ResourceId | string): Promise<ResourceId> {
    if (typeof id === 'string')
      return await this.projectIdToResourceId(id);
    else
      return id;
  }

  /** Opens a project, and starts corresponding project maintenance loop. */
  public async openProject(id: ResourceId | string) {
    const rid = await this.ensureProjectRid(id);
    if (this.openedProjectsByRid.has(rid))
      throw new Error(`Project ${rid} already opened`);
    this.openedProjectsByRid.set(rid, await Project.init(this.env, rid));
    this.openedProjectsList.setValue([...this.openedProjectsByRid.keys()]);
  }

  /** Closes the project, and deallocate all corresponding resources. */
  public closeProject(rid: ResourceId) {
    const prj = this.openedProjectsByRid.get(rid);
    if (prj === undefined)
      throw new Error(`Project ${rid} not found among opened projects`);
    this.openedProjectsByRid.delete(rid);
    prj.destroy();
    this.openedProjectsList.setValue([...this.openedProjectsByRid.keys()]);
  }

  /** Returns a project access object for opened project, for the given project
   * resource id. */
  public getOpenedProject(rid: ResourceId): Project {
    const prj = this.openedProjectsByRid.get(rid);
    if (prj === undefined)
      throw new Error(`Project ${rid} not found among opened projects`);
    return prj;
  }

  /** Deallocates all runtime resources consumed by this object. */
  close() {
    this.openedProjectsByRid.forEach(prj => prj.destroy());
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

    const frontendDownloadDriver = createDownloadUrlDriver(pl, new ConsoleLoggerAdapter(),
      ops.frontendDownloadPath);
    const bpPreparer = new BlockPackPreparer(ops.localSecret);
    const env: MiddleLayerEnvironment = {
      pl, ops, bpPreparer,
      frontendDownloadDriver, localSecret: ops.localSecret
    };

    const openedProjects = new WatchableValue<ResourceId[]>([]);
    const projectListTC = await createProjectList(pl, projects, openedProjects, env);

    return new MiddleLayer(env, projects, openedProjects, projectListTC.tree, projectListTC.computable);
  }
}

