import type {
  PlClient,
  ResourceId } from '@milaboratories/pl-client';
import {
  field,
  isNullResourceId,
  toGlobalResourceId,
} from '@milaboratories/pl-client';
import { createProjectList, ProjectsField, ProjectsResourceType } from './project_list';
import { createProject, withProjectAuthored } from '../mutator/project';
import type { SynchronizedTreeState } from '@milaboratories/pl-tree';
import { BlockPackPreparer } from '../mutator/block-pack/block_pack';
import type { MiLogger, Signer } from '@milaboratories/ts-helpers';
import { HmacSha256Signer } from '@milaboratories/ts-helpers';
import type { ComputableStableDefined } from '@milaboratories/computable';
import { WatchableValue } from '@milaboratories/computable';
import { Project } from './project';
import type {
  MiddleLayerOps,
  MiddleLayerOpsConstructor,
} from './ops';
import {
  DefaultMiddleLayerOpsPaths,
  DefaultMiddleLayerOpsSettings,
} from './ops';
import { randomUUID } from 'node:crypto';
import type { ProjectListEntry } from '../model';
import type { AuthorMarker, ProjectMeta } from '@milaboratories/pl-model-middle-layer';
import { BlockUpdateWatcher } from '../block_registry/watcher';
import type { QuickJSWASMModule } from 'quickjs-emscripten';
import { getQuickJS } from 'quickjs-emscripten';
import type { MiddleLayerDriverKit } from './driver_kit';
import { initDriverKit } from './driver_kit';
import type { DriverKit } from '@platforma-sdk/model';
import { DownloadUrlDriver } from '@milaboratories/pl-drivers';
import { V2RegistryProvider } from '../block_registry';
import type { Dispatcher } from 'undici';
import { RetryAgent } from 'undici';
import { getDebugFlags } from '../debug';
import { ProjectHelper } from '../model/project_helper';

export interface MiddleLayerEnvironment {
  readonly pl: PlClient;
  readonly logger: MiLogger;
  readonly httpDispatcher: Dispatcher;
  readonly retryHttpDispatcher: Dispatcher;
  readonly signer: Signer;
  readonly ops: MiddleLayerOps;
  readonly bpPreparer: BlockPackPreparer;
  readonly frontendDownloadDriver: DownloadUrlDriver;
  readonly blockUpdateWatcher: BlockUpdateWatcher;
  readonly quickJs: QuickJSWASMModule;
  readonly driverKit: MiddleLayerDriverKit;
  readonly cachedProjectCalculator: ProjectHelper;
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
    public readonly driverKit: DriverKit,
    public readonly signer: Signer,
    private readonly projectListResourceId: ResourceId,
    private readonly openedProjectsList: WatchableValue<ResourceId[]>,
    private readonly projectListTree: SynchronizedTreeState,
    public readonly blockRegistryProvider: V2RegistryProvider,
    projectList: ComputableStableDefined<ProjectListEntry[]>,
  ) {
    this.projectList = projectList;
    this.pl = this.env.pl;
  }

  /** Returns extended API driver kit used internally by middle layer. */
  public get internalDriverKit(): MiddleLayerDriverKit {
    return this.env.driverKit;
  }

  //
  // Project List Manipulation
  //

  /** Creates a project with initial state and adds it to project list. */
  public async createProject(meta: ProjectMeta, id: string = randomUUID()): Promise<ResourceId> {
    const resource = await this.pl.withWriteTx('MLCreateProject', async (tx) => {
      const prj = await createProject(tx, meta);
      tx.createField(field(this.projectListResourceId, id), 'Dynamic', prj);
      await tx.commit();
      return await toGlobalResourceId(prj);
    });
    await this.projectListTree.refreshState();
    return resource;
  }

  /** Updates project metadata */
  public async setProjectMeta(
    rid: ResourceId,
    meta: ProjectMeta,
    author?: AuthorMarker,
  ): Promise<void> {
    await withProjectAuthored(this.pl, rid, author, (prj) => {
      prj.setMeta(meta);
    });
    await this.projectListTree.refreshState();
  }

  /** Permanently deletes project from the project list, this will result in
   * destruction of all attached objects, like files, analysis results etc. */
  public async deleteProject(id: string): Promise<void> {
    await this.pl.withWriteTx('MLRemoveProject', async (tx) => {
      tx.removeField(field(this.projectListResourceId, id));
      await tx.commit();
    });
    await this.projectListTree.refreshState();
  }

  //
  // Projects
  //

  private readonly openedProjectsByRid = new Map<ResourceId, Project>();

  private async projectIdToResourceId(id: string): Promise<ResourceId> {
    return await this.pl.withReadTx('Project id to resource id', async (tx) => {
      const rid = (await tx.getField(field(this.projectListResourceId, id))).value;
      if (isNullResourceId(rid)) throw new Error('Unexpected project list structure.');
      return rid;
    });
  }

  private async ensureProjectRid(id: ResourceId | string): Promise<ResourceId> {
    if (typeof id === 'string') return await this.projectIdToResourceId(id);
    else return id;
  }

  /** Opens a project, and starts corresponding project maintenance loop. */
  public async openProject(id: ResourceId | string) {
    const rid = await this.ensureProjectRid(id);
    if (this.openedProjectsByRid.has(rid)) throw new Error(`Project ${rid} already opened`);
    this.openedProjectsByRid.set(rid, await Project.init(this.env, rid));
    this.openedProjectsList.setValue([...this.openedProjectsByRid.keys()]);
  }

  /** Closes the project, and deallocate all corresponding resources. */
  public async closeProject(rid: ResourceId): Promise<void> {
    const prj = this.openedProjectsByRid.get(rid);
    if (prj === undefined) throw new Error(`Project ${rid} not found among opened projects`);
    this.openedProjectsByRid.delete(rid);
    await prj.destroy();
    this.openedProjectsList.setValue([...this.openedProjectsByRid.keys()]);
  }

  /** Returns a project access object for opened project, for the given project
   * resource id. */
  public getOpenedProject(rid: ResourceId): Project {
    const prj = this.openedProjectsByRid.get(rid);
    if (prj === undefined) throw new Error(`Project ${rid} not found among opened projects`);
    return prj;
  }

  /** Deallocates all runtime resources consumed by this object and awaits
   * actual termination of event loops and other processes associated with
   * them. */
  public async close() {
    await Promise.all([...this.openedProjectsByRid.values()].map((prj) => prj.destroy()));
    // this.env.quickJs;
    await this.projectListTree.terminate();
    await this.env.retryHttpDispatcher.destroy();
    await this.pl.close();
  }

  /** @deprecated */
  public async closeAndAwaitTermination() {
    await this.close();
  }

  /** Generates sufficiently random string to be used as local secret for the
   * middle layer */
  public static generateLocalSecret(): string {
    return HmacSha256Signer.generateSecret();
  }

  /** Initialize middle layer */
  public static async init(
    pl: PlClient,
    workdir: string,
    _ops: MiddleLayerOpsConstructor,
  ): Promise<MiddleLayer> {
    const ops: MiddleLayerOps = {
      ...DefaultMiddleLayerOpsSettings,
      ...DefaultMiddleLayerOpsPaths(workdir),
      ..._ops,
    };

    // overriding debug options from environment variables
    ops.defaultTreeOptions.logStat = getDebugFlags().logTreeStats;
    ops.debugOps.dumpInitialTreeState = getDebugFlags().dumpInitialTreeState;

    const projects = await pl.withWriteTx('MLInitialization', async (tx) => {
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

    const logger = ops.logger;

    const driverKit = await initDriverKit(pl, workdir, ops);

    // passed to components having no own retry logic
    const retryHttpDispatcher = new RetryAgent(pl.httpDispatcher, {
      minTimeout: 250,
      maxRetries: 4,
    });

    const v2RegistryProvider = new V2RegistryProvider(retryHttpDispatcher);

    const bpPreparer = new BlockPackPreparer(
      v2RegistryProvider,
      driverKit.signer,
      retryHttpDispatcher,
    );

    const frontendDownloadDriver = new DownloadUrlDriver(
      logger,
      pl.httpDispatcher,
      ops.frontendDownloadPath,
    );

    const quickJs = await getQuickJS();

    const env: MiddleLayerEnvironment = {
      pl,
      signer: driverKit.signer,
      logger,
      httpDispatcher: pl.httpDispatcher,
      retryHttpDispatcher: retryHttpDispatcher,
      ops,
      bpPreparer,
      frontendDownloadDriver,
      driverKit,
      blockUpdateWatcher: new BlockUpdateWatcher(v2RegistryProvider, logger, {
        minDelay: ops.devBlockUpdateRecheckInterval,
        http: retryHttpDispatcher,
        preferredUpdateChannel: ops.preferredUpdateChannel,
      }),
      quickJs,
      cachedProjectCalculator: new ProjectHelper(quickJs),
    };

    const openedProjects = new WatchableValue<ResourceId[]>([]);
    const projectListTC = await createProjectList(pl, projects, openedProjects, env);

    return new MiddleLayer(
      env,
      driverKit,
      driverKit.signer,
      projects,
      openedProjects,
      projectListTC.tree,
      v2RegistryProvider,
      projectListTC.computable,
    );
  }
}
