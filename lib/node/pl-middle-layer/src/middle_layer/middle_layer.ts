import type { PlClient, ResourceId, ResourceRef } from "@milaboratories/pl-client";
import {
  field,
  isNotNullResourceId,
  isNullResourceId,
  resourceIdToString,
} from "@milaboratories/pl-client";
import { LRUCache } from "lru-cache";
import { createProjectList, ProjectsField, ProjectsResourceType } from "./project_list";
import { createProject, duplicateProject, withProjectAuthored } from "../mutator/project";
import { ProjectMetaKey } from "../model/project_model";
import type { ProjectId } from "../model/project_model";
import type { SynchronizedTreeState } from "@milaboratories/pl-tree";
import { BlockPackPreparer } from "../mutator/block-pack/block_pack";
import type { MiLogger, Signer } from "@milaboratories/ts-helpers";
import { BlockEventDispatcher } from "@milaboratories/ts-helpers";
import { HmacSha256Signer } from "@milaboratories/ts-helpers";
import type { ComputableStableDefined } from "@milaboratories/computable";
import { WatchableValue } from "@milaboratories/computable";
import { Project } from "./project";
import type { MiddleLayerOps, MiddleLayerOpsConstructor } from "./ops";
import { DefaultMiddleLayerOpsPaths, DefaultMiddleLayerOpsSettings } from "./ops";
import { randomUUID } from "node:crypto";
import type { ProjectListEntry } from "../model";
import type {
  AuthorMarker,
  ProjectMeta,
  BlockPlatform,
} from "@milaboratories/pl-model-middle-layer";
import { BlockUpdateWatcher } from "../block_registry/watcher";
import type { QuickJSWASMModule } from "quickjs-emscripten";
import { getQuickJS } from "quickjs-emscripten";
import type { MiddleLayerDriverKit } from "./driver_kit";
import { initDriverKit } from "./driver_kit";
import type { BlockCodeFeatureFlags, DriverKit, SupportedRequirement } from "@platforma-sdk/model";
import { RuntimeCapabilities } from "@platforma-sdk/model";
import {
  type ModelServiceRegistry,
  registerServiceCapabilities,
} from "@milaboratories/pl-model-common";
import { createModelServiceRegistry } from "../service_factories";
import type { DownloadUrlDriver } from "@milaboratories/pl-drivers";
import { V2RegistryProvider } from "../block_registry";
import type { Dispatcher } from "undici";
import { RetryAgent } from "undici";
import { getDebugFlags } from "../debug";
import { ProjectHelper } from "../model/project_helper";

export interface MiddleLayerEnvironment {
  dispose(): Promise<void>;
  readonly pl: PlClient;
  readonly runtimeCapabilities: RuntimeCapabilities;
  readonly logger: MiLogger;
  readonly blockEventDispatcher: BlockEventDispatcher;
  readonly httpDispatcher: Dispatcher;
  readonly retryHttpDispatcher: Dispatcher;
  readonly signer: Signer;
  readonly ops: MiddleLayerOps;
  readonly bpPreparer: BlockPackPreparer;
  readonly frontendDownloadDriver: DownloadUrlDriver;
  readonly blockUpdateWatcher: BlockUpdateWatcher;
  readonly quickJs: QuickJSWASMModule;
  readonly driverKit: MiddleLayerDriverKit;
  readonly serviceRegistry: ModelServiceRegistry;
  readonly projectHelper: ProjectHelper;
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
  public readonly pl: PlClient;

  /** Contains a reactive list of projects along with their meta information. */
  public readonly projectList: ComputableStableDefined<ProjectListEntry[]>;

  private constructor(
    private readonly env: MiddleLayerEnvironment,
    public readonly driverKit: DriverKit,
    public readonly signer: Signer,
    private readonly projectListResourceId: ResourceId,
    private readonly openedProjectsList: WatchableValue<ProjectId[]>,
    private readonly projectListTree: SynchronizedTreeState,
    public readonly blockRegistryProvider: V2RegistryProvider,
    projectList: ComputableStableDefined<ProjectListEntry[]>,
  ) {
    this.projectList = projectList;
    this.pl = this.env.pl;
  }

  /**
   * Get the OS where backend is running.
   * For old backend versions returns undefined.
   */
  public get serverPlatform(): BlockPlatform | undefined {
    return this.pl.serverInfo.platform as BlockPlatform | undefined;
  }

  /** Adds a runtime capability to the middle layer. */
  public addRuntimeCapability(
    requirement: SupportedRequirement,
    value: number | boolean = true,
  ): void {
    this.env.runtimeCapabilities.addSupportedRequirement(requirement, value);
  }

  /** Checks if the given block feature flags are compatible with the runtime capabilities. */
  public checkBlockCompatibility(featureFlags: BlockCodeFeatureFlags | undefined): boolean {
    return this.env.runtimeCapabilities.checkCompatibility(featureFlags);
  }

  /** Returns extended API driver kit used internally by middle layer. */
  public get internalDriverKit(): MiddleLayerDriverKit {
    return this.env.driverKit;
  }

  /** Returns the service registry for service introspection. */
  public get serviceRegistry(): ModelServiceRegistry {
    return this.env.serviceRegistry;
  }

  //
  // ProjectId ↔ ResourceId resolution
  //

  private readonly projectIdCache = new LRUCache<ProjectId, ResourceId>({ max: 1024 });

  /** Resolves a ProjectId to a signed ResourceId.
   * Uses LRU cache with TX-scan fallback. */
  private async resolveProjectId(projectId: ProjectId): Promise<ResourceId> {
    const cached = this.projectIdCache.get(projectId);
    if (cached !== undefined) return cached;

    // Cache miss — scan project list fields to find the matching resource
    const rid = await this.pl.withReadTx("ResolveProjectId", async (tx) => {
      const data = await tx.getResourceData(this.projectListResourceId, true);
      for (const f of data.fields) {
        if (isNullResourceId(f.value)) continue;
        if (resourceIdToString(f.value) === (projectId as string)) return f.value;
      }
      throw new Error(`Project ${projectId} not found in project list.`);
    });

    this.projectIdCache.set(projectId, rid);
    return rid;
  }

  //
  // Project List Manipulation
  //

  /** Creates a project with initial state and adds it to project list. */
  public async createProject(meta: ProjectMeta): Promise<ProjectId> {
    let prj: ResourceRef;
    await this.pl.withWriteTx("MLCreateProject", async (tx) => {
      prj = await createProject(tx, meta);
      tx.createField(field(this.projectListResourceId, randomUUID()), "Dynamic", prj);
      await tx.commit();
    });
    await this.projectListTree.refreshState();

    const signedRid = await prj!.globalId;
    const projectId = resourceIdToString(signedRid) as ProjectId;
    this.projectIdCache.set(projectId, signedRid);
    return projectId;
  }

  /** Updates project metadata */
  public async setProjectMeta(
    id: ProjectId,
    meta: ProjectMeta,
    author?: AuthorMarker,
  ): Promise<void> {
    const rid = await this.resolveProjectId(id);
    await withProjectAuthored(
      this.env.projectHelper,
      this.pl,
      rid,
      author,
      (prj) => {
        prj.setMeta(meta);
      },
      { name: "setProjectMeta" },
    );
    await this.projectListTree.refreshState();
  }

  /** Permanently deletes project from the project list, this will result in
   * destruction of all attached objects, like files, analysis results etc. */
  public async deleteProject(id: ProjectId): Promise<void> {
    await this.pl.withWriteTx("MLRemoveProject", async (tx) => {
      const data = await tx.getResourceData(this.projectListResourceId, true);
      let fieldName: string | undefined;
      for (const f of data.fields) {
        if (isNullResourceId(f.value)) continue;
        if (resourceIdToString(f.value) === (id as string)) {
          fieldName = f.name;
          break;
        }
      }
      if (fieldName === undefined) throw new Error(`Project ${id} not found in project list.`);
      tx.removeField(field(this.projectListResourceId, fieldName));
      await tx.commit();
    });
    this.projectIdCache.delete(id);
    await this.projectListTree.refreshState();
  }

  /**
   * Duplicates an existing project and adds the copy to this user's project list.
   *
   * @param srcProjectId - project id of the project to duplicate
   * @param rename - optional function that receives the source label and all existing
   *   project labels (read within the same transaction), and returns the label for the copy
   */
  public async duplicateProject(
    srcProjectId: ProjectId,
    rename?: (previousLabel: string, existingLabels: string[]) => string,
  ): Promise<ProjectId> {
    const sourceRid = await this.resolveProjectId(srcProjectId);
    let newPrj: ResourceRef;
    await this.pl.withWriteTx("MLDuplicateProject", async (tx) => {
      // Read source project meta
      const sourceMeta = await tx.getKValueJson<ProjectMeta>(sourceRid, ProjectMetaKey);

      // Read all existing project labels from the project list (parallel reads)
      const projectListData = await tx.getResourceData(this.projectListResourceId, true);
      const projectRids = projectListData.fields.map((f) => f.value).filter(isNotNullResourceId);
      const existingLabels = (
        await Promise.all(
          projectRids.map((rid) => tx.getKValueJson<ProjectMeta>(rid, ProjectMetaKey)),
        )
      ).map((m) => m.label);

      // Compute new label
      const newLabel = rename ? rename(sourceMeta.label, existingLabels) : sourceMeta.label;

      // Create the duplicate
      newPrj = await duplicateProject(tx, sourceRid, { label: newLabel });

      // Attach to project list with a random UUID field name
      tx.createField(field(this.projectListResourceId, randomUUID()), "Dynamic", newPrj);
      await tx.commit();
    });
    await this.projectListTree.refreshState();

    const signedRid = await newPrj!.globalId;
    const newProjectId = resourceIdToString(signedRid) as ProjectId;
    this.projectIdCache.set(newProjectId, signedRid);
    return newProjectId;
  }

  //
  // Projects
  //

  private readonly openedProjects = new Map<ProjectId, Project>();

  /** Opens a project, and starts corresponding project maintenance loop. */
  public async openProject(id: ProjectId): Promise<void> {
    if (this.openedProjects.has(id)) throw new Error(`Project ${id} already opened`);
    const rid = await this.resolveProjectId(id);
    this.openedProjects.set(id, await Project.init(this.env, id, rid));
    this.openedProjectsList.setValue([...this.openedProjects.keys()]);
  }

  /** Closes the project, and deallocate all corresponding resources. */
  public async closeProject(id: ProjectId): Promise<void> {
    const prj = this.openedProjects.get(id);
    if (prj === undefined) throw new Error(`Project ${id} not found among opened projects`);
    this.openedProjects.delete(id);
    await prj.destroy();
    this.openedProjectsList.setValue([...this.openedProjects.keys()]);
  }

  /** Returns a project access object for an opened project. */
  public getOpenedProject(id: ProjectId): Project {
    const prj = this.openedProjects.get(id);
    if (prj === undefined) throw new Error(`Project ${id} not found among opened projects`);
    return prj;
  }

  /** Returns true if project with given id is currently opened. */
  public isProjectOpened(id: ProjectId): boolean {
    return this.openedProjects.has(id);
  }

  /**
   * Deallocates all runtime resources consumed by this object and awaits
   * actual termination of event loops and other processes associated with
   * them.
   */
  public async close() {
    await Promise.all([...this.openedProjects.values()].map((prj) => prj.destroy()));
    // this.env.quickJs;
    await this.projectListTree.terminate();
    await this.env.dispose();
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

  /** Returns a block event dispatcher, which can be used to listen to block events. */
  public get blockEventDispatcher(): BlockEventDispatcher {
    return this.env.blockEventDispatcher;
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

    const projects = await pl.withWriteTx("MLInitialization", async (tx) => {
      const projectsField = field(tx.clientRoot, ProjectsField);
      tx.createField(projectsField, "Dynamic");
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

    const driverKit = await initDriverKit(pl, workdir, ops.frontendDownloadPath, ops);

    // passed to components having no own retry logic
    const retryHttpDispatcher = new RetryAgent(pl.httpDispatcher);

    const v2RegistryProvider = new V2RegistryProvider(retryHttpDispatcher);

    const bpPreparer = new BlockPackPreparer(
      v2RegistryProvider,
      driverKit.signer,
      retryHttpDispatcher,
    );

    const quickJs = await getQuickJS();

    const runtimeCapabilities = new RuntimeCapabilities();
    // add runtime capabilities of model here
    runtimeCapabilities.addSupportedRequirement("requiresModelAPIVersion", 1);
    runtimeCapabilities.addSupportedRequirement("requiresModelAPIVersion", 2);
    runtimeCapabilities.addSupportedRequirement("requiresCreatePTable", 2);
    registerServiceCapabilities((flag, value) =>
      runtimeCapabilities.addSupportedRequirement(flag, value),
    );
    // runtime capabilities of the desktop are to be added by the desktop app / test framework

    const serviceRegistry = createModelServiceRegistry({ logger });

    const env: MiddleLayerEnvironment = {
      pl,
      blockEventDispatcher: new BlockEventDispatcher(),
      signer: driverKit.signer,
      logger,
      httpDispatcher: pl.httpDispatcher,
      retryHttpDispatcher,
      ops,
      bpPreparer,
      frontendDownloadDriver: driverKit.frontendDriver,
      driverKit,
      blockUpdateWatcher: new BlockUpdateWatcher(v2RegistryProvider, logger, {
        minDelay: ops.devBlockUpdateRecheckInterval,
        http: retryHttpDispatcher,
        preferredUpdateChannel: ops.preferredUpdateChannel,
      }),
      runtimeCapabilities,
      serviceRegistry,
      quickJs,
      projectHelper: new ProjectHelper(quickJs, logger),
      dispose: async () => {
        await serviceRegistry.dispose();
        await retryHttpDispatcher.destroy();
        await driverKit.dispose();
      },
    };

    const openedProjects = new WatchableValue<ProjectId[]>([]);
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
