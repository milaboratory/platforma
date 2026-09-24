import type {
  PlClient,
  PlTransaction,
  SignedResourceId,
  ResourceRef,
  Role,
} from "@milaboratories/pl-client";
import {
  field,
  GrantType,
  isNullSignedResourceId,
  resourceIdToString,
} from "@milaboratories/pl-client";
import { LRUCache } from "lru-cache";
import {
  createProjectList,
  ensureProjectListRid,
  ProjectsField,
  ProjectsResourceType,
} from "./project_list";
import type { FoldersListing, FoldersRids } from "./folders";
import {
  createFolder,
  createFolderList,
  deleteFolder,
  moveFolderItems,
  openFoldersTx,
  previewFolderDeletion,
  previewFoldersMove,
  foldersLocalSubtree,
  FoldersField,
  FoldersResourceType,
  renameFolder,
  resetFolders,
  setFolderDescription,
} from "./folders";
import type {
  FolderId,
  FoldersItem,
  FoldersLeafItem,
  FoldersMoveOutcome,
  FoldersMovePlan,
  FoldersMovePlanResult,
  FoldersRemoval,
  FoldersRemovalOutcome,
  FoldersRemovalPlanResult,
} from "@milaboratories/pl-model-middle-layer";
import type {
  CreateProjectFromTemplateOutcome,
  SaveProjectAsTemplateOutcome,
  StoredTemplateData,
  TemplateId,
  TemplateListEntry,
} from "./template_list";
import {
  createTemplateList,
  decodeStoredTemplateData,
  TemplateDescriptionKey,
  TemplateLabelKey,
  TemplatesField,
  TemplatesResourceType,
} from "./template_list";
import {
  createTemplate,
  deleteTemplate,
  renameTemplate,
  setTemplateDescription,
} from "../mutator/template";
import { listedById, notListedError } from "../mutator/list";
import {
  createProject,
  duplicateProject,
  withProject,
  withProjectAuthored,
} from "../mutator/project";
import type { ProjectTemplateExportOutcome } from "../model/template_serializer";
import type { ProjectTemplateV1 } from "@milaboratories/pl-model-common";
import { asProjectId, asTemplateId } from "@milaboratories/pl-model-common";
import { extractConfig, ensureError } from "@platforma-sdk/model";
import type { TemplateApplyProblem, TemplateApplyReport } from "../model/template_apply";
import { TemplateEntryRejected, kindMismatch } from "../model/template_apply";
import type { BlockPackProvider, TemplateResolveOutcome } from "../model/template_resolve";
import { resolveTemplateEntries } from "../model/template_resolve";
import type { PreparedTemplateEntry } from "../mutator/template_construct";
import { applyTemplateEntries } from "../mutator/template_construct";
import { throwIfMissingServerCapabilities } from "./project";
import { cacheBlockPackTemplate } from "../mutator/template/template_cache";
import { ProjectMetaKey } from "../model/project_model";
import type { ProjectId } from "../model/project_model";
import type { SynchronizedTreeState } from "@milaboratories/pl-tree";
import {
  canGrantToEveryone,
  canImpersonate,
  decodeEnvelopeData,
  SharingOutboxField,
  SharingOutboxResourceType,
  SharingStateField,
  SharingStateResourceType,
  envelopeFolderRoot,
  newEnvelopeFolderId,
  type EnvelopeData,
  type ShareFolderOptions,
  type ShareId,
  type ShareOptions,
  type ShareOutcome,
  type ShareProjectsOptions,
  type ShareTemplateOptions,
} from "../model/sharing_model";
import {
  buildFolderShareEnvelope,
  buildShareEnvelope,
  buildTemplateShareEnvelope,
  copyEnvelopeProjectsIntoList,
  writeShareHidden,
  clearShareHidden,
  type EnvelopeFolderSubtree,
  type EnvelopeProjectSource,
} from "../mutator/sharing";
import type { LiveEnvelope, OutgoingShare, AvailableShare } from "./sharing_list";
import {
  createLiveEnvelopesComputable,
  createOutgoingShares,
  createAvailableSharesComputable,
  createAvailableSharesTree,
  createSharingStateTree,
} from "./sharing_list";
import { BlockPackPreparer } from "../mutator/block-pack/block_pack";
import type { MiLogger, Signer } from "@milaboratories/ts-helpers";
import { BlockEventDispatcher } from "@milaboratories/ts-helpers";
import { HmacSha256Signer } from "@milaboratories/ts-helpers";
import type { Computable, ComputableStableDefined } from "@milaboratories/computable";
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
import {
  foldersNameTaken,
  foldersUniqueName,
  inheritedFolder,
  normalizeDescription,
} from "@milaboratories/pl-model-middle-layer";
import type { AppliedEntry } from "../model/template_apply";
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
  REQUIRES_PFRAMES_VERSION,
} from "@milaboratories/pl-model-common";
import { createModelServiceRegistry } from "../service_factories";
import type { DownloadUrlDriver } from "@milaboratories/pl-drivers";
import { V2RegistryProvider } from "../block_registry";
import type { Dispatcher } from "undici";
import { RetryAgent } from "undici";
import { getDebugFlags } from "../debug";
import { ProjectHelper } from "../model/project_helper";
import type { TreeSnapshotStat } from "./tree_snapshot_store";
import { TreeSnapshotStore } from "./tree_snapshot_store";

/** How long shutdown waits for close-boundary snapshot writes that are already running. Long
 *  enough for a ten-megabyte encode and write on ordinary storage, short enough that a wedged
 *  filesystem does not hold the quit open. */
const SNAPSHOT_DRAIN_TIMEOUT_MS = 5_000;

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
  /** Persisted project tree mirrors. Undefined when snapshots are switched off, or when the
   *  client is impersonating another user, in which case nothing is read or written. */
  readonly treeSnapshots?: TreeSnapshotStore;
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

  private constructor(
    private readonly env: MiddleLayerEnvironment,
    public readonly driverKit: DriverKit,
    public readonly signer: Signer,
    private readonly projectListResourceId: SignedResourceId,
    private readonly templateListResourceId: SignedResourceId,
    private readonly sharingOutboxResourceId: SignedResourceId,
    private readonly sharingStateResourceId: SignedResourceId,
    private readonly foldersResourceId: SignedResourceId,
    private readonly openedProjectsList: WatchableValue<ProjectId[]>,
    private readonly projectListTree: SynchronizedTreeState,
    private readonly templateListTree: SynchronizedTreeState,
    private readonly foldersTree: SynchronizedTreeState,
    private readonly sharingOutboxTree: SynchronizedTreeState,
    private readonly sharingStateTree: SynchronizedTreeState,
    private readonly availableSharesTree: SynchronizedTreeState,
    public readonly blockRegistryProvider: V2RegistryProvider,
    /** Contains a reactive list of projects along with their meta information. */
    public readonly projectList: ComputableStableDefined<ProjectListEntry[]>,
    /** Contains a reactive list of stored templates along with their labels and provenance. */
    public readonly templateList: ComputableStableDefined<TemplateListEntry[]>,
    /** The folder tree and the project list, already joined. The desktop reads this and never
     *  the two halves, so it cannot render a list and a tree that are one refresh apart. */
    public readonly folders: ComputableStableDefined<FoldersListing>,
    /** Reactive view of the donor's outbox — the shares this user has created. */
    public outgoingShares: Computable<OutgoingShare[] | undefined>,
    /** Shares granted to this user, hidden ones included and flagged as such. Fed by the
     *  shared-resource discovery tree. */
    public availableShares: Computable<AvailableShare[] | undefined>,
    /** Internal: the recipient's currently-live envelopes, read from the same shared-resource
     *  discovery tree as {@link availableShares}. The single source {@link copyShare} resolves
     *  live envelopes from — no second discovery path. */
    private readonly liveEnvelopes: Computable<LiveEnvelope[] | undefined>,
  ) {
    this.pl = this.env.pl;
    this.startEnvelopeCleanup();
  }

  /**
   * Get the OS where backend is running.
   * For old backend versions returns undefined.
   */
  public get serverPlatform(): BlockPlatform | undefined {
    return this.pl.serverInfo.platform as BlockPlatform | undefined;
  }

  /**
   * Runtime capabilities advertised by the connected backend (tokens of
   * the form `<feature>:<version>`, e.g. "wasm:v1"). Empty list if the
   * backend predates the capability mechanism — that's the desired
   * fail-closed behaviour for blocks declaring any `requiredCapabilities`.
   */
  public get serverCapabilities(): string[] {
    return this.pl.serverInfo.capabilities ?? [];
  }

  /**
   * Login of the authenticated user, for the "Signed in as" UI. `null` when the
   * backend has no auth (local/dev mode) — the UI hides the element.
   */
  public get currentUserLogin(): string | null {
    return this.pl.userResources.authUser;
  }

  /**
   * Whether the connected backend supports project sharing. Synthetic — computed
   * in the middle layer from the backend capabilities the share flow needs (the
   * cross-color field-reference relaxation a copy out of a share rests on). It can absorb
   * additional required capabilities later without a UI change.
   */
  public get sharingSupported(): boolean {
    // Sharing does not compose with impersonation (discovery is scoped to the admin's session,
    // decisions attribute to the admin), so it is disabled while impersonating. Admins move
    // projects across roots with duplicateProjectToUser instead.
    return this.serverCapabilities.includes("crossTreeRefs:v1") && !this.impersonating;
  }

  /** True when this session is impersonating another user (an admin opened another user's root). */
  public get impersonating(): boolean {
    return this.pl.conf.asUser !== undefined;
  }

  /**
   * Role of the authenticated user, from the `GetSessionInfo` RPC surfaced through the
   * pl-client. `null` in no-auth mode (when {@link currentUserLogin} is null).
   */
  public get currentUserRole(): Role | null {
    return this.pl.currentUserRole;
  }

  /**
   * Whether the UI offers share-with-everybody — no role policy lives in the UI:
   *   serverCapabilities.has("publicGrants:v1") && canGrantToEveryone(currentUserRole)
   * Not a security boundary: a crafted call still hits the backend's role +
   * permission-ceiling gate.
   */
  public get canShareWithEveryone(): boolean {
    return (
      !this.impersonating &&
      this.serverCapabilities.includes("publicGrants:v1") &&
      canGrantToEveryone(this.currentUserRole)
    );
  }

  /**
   * Whether the authenticated user may impersonate others (open another user's root). Mirrors
   * the backend's `CanImpersonate` role gate — admin/controller only, never a regular user.
   * Derived from the session role, which stays the authenticated admin's even while
   * impersonating, so this stays true across a switch: the "return to my root" affordance must
   * not vanish mid-impersonation. Not a security boundary; the backend re-checks on every call.
   */
  public get currentUserCanImpersonate(): boolean {
    return canImpersonate(this.currentUserRole);
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
  // ProjectId ↔ SignedResourceId resolution
  //

  private readonly projectIdCache = new LRUCache<ProjectId, SignedResourceId>({ max: 1024 });

  /** Resolves a ProjectId to a signed SignedResourceId.
   * Uses LRU cache with TX-scan fallback. */
  private async resolveProjectId(projectId: ProjectId): Promise<SignedResourceId> {
    const cached = this.projectIdCache.get(projectId);
    if (cached !== undefined) return cached;

    // Cache miss — scan project list fields to find the matching resource
    const rid = await this.pl.withReadTx("ResolveProjectId", async (tx) => {
      const entry = (await listedById(tx, this.projectListResourceId)).get(projectId);
      if (entry === undefined) throw notListedError("Project", projectId);
      return entry.rid;
    });

    this.projectIdCache.set(projectId, rid);
    return rid;
  }

  //
  // Project List Manipulation
  //

  /**
   * Creates a project with initial state and adds it to project list.
   *
   * `folder` is where it lands, placed in the transaction that creates it so the project never
   * shows up at the top level first. Left out, or naming a folder that is gone, it lands at the
   * top level.
   */
  public async createProject(meta: ProjectMeta, folder?: FolderId): Promise<ProjectId> {
    const signedRid = await this.pl.withWriteTx("MLCreateProject", async (tx) => {
      const tree = folder === undefined ? undefined : await openFoldersTx(tx, this.foldersRids);
      const prj = await createProject(tx, meta);
      tx.createField(field(this.projectListResourceId, randomUUID()), "Dynamic", prj);
      const rid = await prj.globalId;
      // A folder deleted while the project was being made costs the project its placement, not
      // its existence.
      if (tree !== undefined && tree.view.folders.some((candidate) => candidate.id === folder))
        tree.place([{ kind: "project", id: asProjectId(resourceIdToString(rid)) }], folder);
      await tx.commit();
      return rid;
    });
    await Promise.all([
      this.projectListTree.refreshState(),
      ...(folder === undefined ? [] : [this.foldersTree.refreshState()]),
    ]);

    const projectId = asProjectId(resourceIdToString(signedRid));
    this.projectIdCache.set(projectId, signedRid);
    return projectId;
  }

  /**
   * Updates the project metadata fields the caller names, leaving the others as they are.
   *
   * A patch rather than a replacement because the label and the description are edited from two
   * different places: a rename that carried a stale description alongside the new name would
   * undo a description edit that happened in between, and the reverse.
   *
   * The label is stored trimmed, and it goes into the namespace folders share, so a label
   * already carried by something else inside the same folder is refused rather than written — a
   * human typed it, and a name that silently becomes a different name is worse than one that is
   * turned down. The check and the write share one transaction, so two renames racing for the
   * same name cannot both win. Duplicates an account already holds are tolerated and never
   * rewritten; see the name check of {@link openFoldersTx}.
   */
  public async setProjectMeta(
    id: ProjectId,
    meta: Partial<ProjectMeta>,
    author?: AuthorMarker,
  ): Promise<void> {
    const rid = await this.resolveProjectId(id);
    const label = meta.label?.trim();
    const patch = label === undefined ? meta : { ...meta, label };
    await this.pl.withWriteTx("ProjectAction: setProjectMeta", async (tx) => {
      if (label !== undefined)
        (await openFoldersTx(tx, this.foldersRids)).assertNameFree({ kind: "project", id }, label);
      await withProjectAuthored(this.env.projectHelper, tx, rid, author, (prj) => {
        prj.updateMeta(patch);
      });
      await tx.commit();
    });
    await this.projectListTree.refreshState();
  }

  //
  // Folders
  //

  private get foldersRids(): FoldersRids {
    return {
      folders: this.foldersResourceId,
      projects: this.projectListResourceId,
      templates: this.templateListResourceId,
    };
  }

  /** Creates a folder inside `parent`, or at the top level, and returns its id. A name already
   *  used there is rejected. */
  public async createFolder(name: string, parent?: FolderId): Promise<FolderId> {
    const id = await createFolder(this.pl, this.foldersRids, name, parent);
    await this.foldersTree.refreshState();
    return id;
  }

  /** Renames a folder. A name already used beside it is rejected. */
  public async renameFolder(folder: FolderId, name: string): Promise<void> {
    await renameFolder(this.pl, this.foldersRids, folder, name);
    await this.foldersTree.refreshState();
  }

  /** Sets what a folder says about itself; blank clears it. Descriptions are in no namespace, so
   *  nothing is refused here. */
  public async setFolderDescription(folder: FolderId, description: string): Promise<void> {
    await setFolderDescription(this.pl, this.foldersRids, folder, description);
    await this.foldersTree.refreshState();
  }

  /** The plan a move would produce — every item and the name it ends up with. Shown for
   *  confirmation, then handed back to {@link moveFolderItems} unchanged. */
  public async previewFoldersMove(
    items: readonly FoldersItem[],
    destination?: FolderId,
  ): Promise<FoldersMovePlanResult> {
    return await previewFoldersMove(this.pl, this.foldersRids, items, destination);
  }

  /**
   * Moves folders, projects and templates into one destination.
   *
   * The plan is recomputed inside the write transaction and the move commits only when it is
   * identical to `confirmedPlan`; otherwise nothing is written and the fresh plan comes back to
   * be confirmed again.
   */
  public async moveFolderItems(
    items: readonly FoldersItem[],
    destination: FolderId | undefined,
    confirmedPlan: FoldersMovePlan,
  ): Promise<FoldersMoveOutcome> {
    const outcome = await moveFolderItems(
      this.pl,
      this.foldersRids,
      items,
      destination,
      confirmedPlan,
    );
    if (outcome.ok)
      await Promise.all([
        this.foldersTree.refreshState(),
        this.projectListTree.refreshState(),
        this.templateListTree.refreshState(),
      ]);
    return outcome;
  }

  /** What deleting a folder would destroy: the subtree of folders, and everything in it. */
  public async previewFolderDeletion(folder: FolderId): Promise<FoldersRemovalPlanResult> {
    return await previewFolderDeletion(this.pl, this.foldersRids, folder);
  }

  /** Deletes a folder, every folder inside it, and every project and template held anywhere in
   *  that subtree.
   *  Refused as `needs-confirmation` until the removal it returns is passed back as
   *  `confirmedRemoval`, and as `plan-changed` if the subtree has changed since. */
  public async deleteFolder(
    folder: FolderId,
    confirmedRemoval?: FoldersRemoval,
  ): Promise<FoldersRemovalOutcome> {
    const outcome = await deleteFolder(this.pl, this.foldersRids, folder, confirmedRemoval);
    if (outcome.ok) {
      // What the folder held is gone from the lists, so an id cached for it would resolve to a
      // resource nothing holds any more.
      for (const id of outcome.removal.projects) this.projectIdCache.delete(id);
      for (const id of outcome.removal.templates) this.templateIdCache.delete(id);
      await Promise.all([
        this.foldersTree.refreshState(),
        this.projectListTree.refreshState(),
        this.templateListTree.refreshState(),
      ]);
    }
    return outcome;
  }

  /**
   * Replaces a folder document this build cannot read — one written by a newer version, or one
   * nothing here can parse — with an empty one. Every folder is gone afterwards; every project and
   * template stays and shows at the top level. Refused while the document can be read.
   */
  public async resetFolders(): Promise<void> {
    await resetFolders(this.pl, this.foldersRids);
    await this.foldersTree.refreshState();
  }

  /**
   * Duplicates a folder and everything under it: the folders inside, a duplicate of every project
   * in them, and a copy of every template.
   *
   * The copy lands beside the source, so only its root needs a name of its own — `X (Copy)`.
   * Nothing inside is renamed: names are compared among siblings, and a copied folder's children
   * are only ever compared with each other, where they came in distinct already.
   *
   * The subtree is read first and rebuilt in one write transaction, so the folders and everything
   * they hold appear together or not at all.
   */
  public async duplicateFolder(folder: FolderId): Promise<void> {
    const subtree = await this.loadFolderSubtree(folder, () => randomUUID());

    const created = await this.pl.withWriteTx("MLDuplicateFolder", async (tx) => {
      const tree = await openFoldersTx(tx, this.foldersRids);
      const items: (FoldersLeafItem & { folder: string })[] = [];
      const projects: SignedResourceId[] = [];
      const templates: { id: TemplateId; rid: SignedResourceId }[] = [];

      for (const project of subtree.projects) {
        // The whole metadata carries over, label included: the duplicate lands in a folder of its
        // own that holds nothing else, so there is nothing there for its name to collide with.
        const meta = await tx.getKValueJson<ProjectMeta>(project.rid, ProjectMetaKey);
        const copy = await duplicateProject(tx, project.rid, meta, this.env.projectHelper);
        tx.createField(field(this.projectListResourceId, randomUUID()), "Dynamic", copy);
        const rid = await copy.globalId;
        projects.push(rid);
        items.push({
          kind: "project",
          id: asProjectId(resourceIdToString(rid)),
          folder: project.folder,
        });
      }

      for (const template of subtree.templates) {
        // A stored template is immutable, so its copy is the same blob under a new resource —
        // provenance and all.
        const copy = createTemplate(
          tx,
          this.templateListResourceId,
          { label: template.label, description: template.description },
          template.data,
        );
        const rid = await copy.globalId;
        const id = asTemplateId(resourceIdToString(rid));
        templates.push({ id, rid });
        items.push({ kind: "template", id, folder: template.folder });
      }

      tree.graft({ root: subtree.root, folders: subtree.folders, items }, subtree.parent);

      await tx.commit();
      return { projects, templates };
    });

    for (const rid of created.projects)
      this.projectIdCache.set(asProjectId(resourceIdToString(rid)), rid);
    for (const { id, rid } of created.templates) this.templateIdCache.set(id, rid);

    await Promise.all([
      this.foldersTree.refreshState(),
      this.projectListTree.refreshState(),
      this.templateListTree.refreshState(),
    ]);
  }

  /**
   * A folder subtree as a copy needs it: the folders under ids local to this read, the key the
   * subtree's root goes by, the resource of every project in them, every template read whole, and
   * the folder the source sits in — which is where a duplicate lands.
   *
   * Read in a transaction of its own, before the write that copies it: every template is a read,
   * and none of it has to be atomic with the copying, because a project or a template that
   * disappears meanwhile fails that write on its own.
   */
  private async loadFolderSubtree<Id extends string>(
    folder: FolderId,
    mint: () => Id,
  ): Promise<FolderSubtree<Id>> {
    return await this.pl.withReadTx("MLReadFolderSubtree", async (tx) => {
      const tree = await openFoldersTx(tx, this.foldersRids);
      const source = tree.view.folders.find((candidate) => candidate.id === folder);
      if (source === undefined) throw new Error(`Folder ${folder} does not exist.`);

      const { inSubtree, localId, folders } = foldersLocalSubtree(tree.view, folder, mint);

      const projects: FolderSubtree<Id>["projects"] = [];
      for (const project of tree.view.projects) {
        if (project.folder === undefined || !inSubtree.has(project.folder)) continue;
        const rid = tree.projectRids.get(project.id);
        if (rid === undefined) throw notListedError("Project", project.id);
        projects.push({ projectId: project.id, rid, folder: localId(project.folder) });
      }

      const templates: Promise<FolderSubtree<Id>["templates"][number]>[] = [];
      for (const template of tree.view.templates) {
        if (template.folder === undefined || !inSubtree.has(template.folder)) continue;
        const rid = tree.templateRids.get(template.id);
        if (rid === undefined) throw notListedError("Template", template.id);
        const local = localId(template.folder);
        templates.push(
          readStoredTemplate(tx, template.id, rid).then((stored) => ({ ...stored, folder: local })),
        );
      }

      return {
        ...(source.parent === undefined ? {} : { parent: source.parent }),
        root: localId(folder),
        folders,
        projects,
        templates: await Promise.all(templates),
      };
    });
  }

  /**
   * Renders a project as a `template-v1` YAML document, or reports every reason it
   * cannot be — the backing call for an "Export Project as Template…" command.
   *
   * Takes a project id rather than an open {@link Project} because exporting is a
   * property of the stored project, not of a session with it: the command belongs on
   * a project card, where the project is usually closed. Opening one to read it would
   * spin up trees and watchers for a one-shot read, and then have to decide whether to
   * close them again.
   *
   * Read-only — the underlying mutator touches no field, so the transaction is never
   * committed and the project list needs no refresh.
   *
   * @param id - project id of the project to export
   */
  public async exportProjectAsTemplate(id: ProjectId): Promise<ProjectTemplateExportOutcome> {
    const rid = await this.resolveProjectId(id);
    return await withProject(
      this.env.projectHelper,
      this.pl,
      rid,
      (prj) => prj.exportAsTemplateV1(),
      { name: "exportProjectAsTemplate" },
    );
  }

  /**
   * Creates the blocks a `template-v1` document describes in an existing project, in the
   * order the document lists them — the backing call for a "Create Project from Template
   * file…" command, which is `createProject` followed by this.
   *
   * Takes a project id rather than an open {@link Project}, like
   * {@link exportProjectAsTemplate} and for the same reason: applying a template is a
   * property of the stored project, not of a session with it, and the flow that needs it
   * has just created the project and has no session yet. An already-open session picks the
   * new blocks up through its own refresh loop.
   *
   * Three stages, and their order is the design:
   *
   * 1. **Resolve every entry** to a concrete block pack, through `provider`.
   * 2. **Prepare every block**: fetch it, check it can run against this backend, cache its
   *    workflow template, and offer the entry's params to the block's kind for a shape
   *    check.
   * 3. **Create the blocks**, in one transaction — each one's params first pointed at this
   *    project by the block's own model, since which values in there are references is
   *    knowledge only the block has.
   *
   * The first two create nothing, so either of them failing leaves the project exactly as it
   * was. They are also what leaves stage 3 with only in-memory work, and hence able to be a
   * single transaction.
   *
   * **Stage 3 is all or nothing too**, because it is that one transaction: an entry it cannot
   * create throws, the transaction is never committed, and the project keeps none of the
   * blocks the apply had placed. So `problems` non-empty always means `added` is empty, at
   * every stage — a caller never has to reconcile a half-built project, and never has to ask
   * which of the blocks present came from the file.
   *
   * What is NOT checked before the work starts: which entries an entry references. Reading
   * that means reading the params, which only the block can do, and no block exists until
   * stage 2 has fetched one. A file whose entry references one listed below it therefore
   * applies, and the block it creates reports itself as missing references — the same way a
   * reference to a deleted block already behaves.
   *
   * @param id Project to apply into
   * @param document A parsed template document
   * @param provider Where each entry's block comes from
   * @param options `allowUnstable` widens resolution to pre-release implementations, for
   *   the whole document
   */
  public async applyTemplateToProject(
    id: ProjectId,
    document: ProjectTemplateV1,
    provider: BlockPackProvider,
    options: { allowUnstable?: boolean; author?: AuthorMarker } = {},
  ): Promise<TemplateApplyReport> {
    const preparation = await this.prepareTemplateEntries(document, provider, {
      allowUnstable: options.allowUnstable ?? false,
    });
    if (preparation.problems.length > 0) return { added: [], problems: preparation.problems };
    return await this.applyPreparedEntries(id, document, preparation.prepared, options.author);
  }

  /**
   * Stages 1 and 2 of an apply — resolve every entry to a block pack, then prepare every
   * block — for a document that may not have a project yet.
   *
   * Neither stage creates anything, which is what lets a caller run them before it decides to
   * create a project at all: {@link createProjectFromTemplate} does exactly that, so an
   * unapplicable template leaves no empty project behind.
   */
  private async prepareTemplateEntries(
    document: ProjectTemplateV1,
    provider: BlockPackProvider,
    options: { allowUnstable: boolean },
  ): Promise<{
    prepared: Map<string, PreparedTemplateEntry>;
    problems: TemplateApplyProblem[];
  }> {
    const prepared = new Map<string, PreparedTemplateEntry>();

    const resolution = await resolveTemplateEntries(document, provider, options);
    if (resolution.problems.length > 0) return { prepared, problems: [...resolution.problems] };

    // One map, not one per field: resolution reports by entry id, so everything this loop
    // needs about an entry is looked up the same way.
    const byEntryId = new Map(document.blocks.map((entry) => [entry.id, entry]));
    const problems: TemplateApplyProblem[] = [];

    for (const entry of resolution.resolved) {
      try {
        const documentEntry = byEntryId.get(entry.entryId)!;
        const preparedBp = await this.env.bpPreparer.prepare(entry.spec);
        const blockCfg = extractConfig(preparedBp.config);

        // The first question asked of the prepared block: is it the block this entry meant.
        // Everything below is only meaningful once the answer is yes.
        //
        // The locator is appended here rather than inside the check, which names no route:
        // when the file chose the implementation itself, what it chose is the thing to correct.
        const mismatch = kindMismatch(documentEntry.kind, preparedBp.config.kind);
        if (mismatch !== undefined) {
          const locator = documentEntry.location ?? documentEntry.block;
          problems.push({
            entryId: entry.entryId,
            error: locator === undefined ? `${mismatch}.` : `${mismatch} (${locator}).`,
          });
          continue;
        }

        // The same two gates `Project.addBlock` applies, for the same reason: a block that
        // cannot run here must not be installed. Here they become per-entry problems
        // rather than throws, so one unusable block reads as one bad entry.
        this.env.runtimeCapabilities.throwIfIncompatible(blockCfg.featureFlags);
        throwIfMissingServerCapabilities(this.pl, preparedBp.requiredCapabilities);

        const cachedBp = await cacheBlockPackTemplate(this.pl, preparedBp);

        // Offered to the block's kind while nothing has been created yet. Every entry is
        // checked, including one whose file omitted `params` — the parser read that as `{}`,
        // which a kind with required fields rejects, and rightly: it would otherwise apply as
        // a block that looks configured and is not.
        const checked = this.env.projectHelper.validateTemplateParamsInVM(
          blockCfg,
          documentEntry.params,
        );
        if (checked.error !== undefined) {
          problems.push({ entryId: entry.entryId, error: checked.error.message });
          continue;
        }

        // The block package's own title, the same thing the add-block UI writes. It is
        // what the user sees for a block whose model derives no title of its own, and it
        // is resolution's to supply — nothing here could reconstruct it.
        prepared.set(entry.entryId, { blockPack: cachedBp, label: entry.title });
      } catch (e) {
        problems.push({
          entryId: entry.entryId,
          error: `This entry's block could not be installed: ${ensureError(e).message}`,
        });
      }
    }

    return { prepared, problems };
  }

  /**
   * Stage 3 of an apply — create the blocks in one transaction, all or nothing.
   *
   * An entry it cannot create throws, the transaction is never committed, and the project keeps
   * none of the blocks the apply had placed.
   */
  private async applyPreparedEntries(
    id: ProjectId,
    document: ProjectTemplateV1,
    prepared: Map<string, PreparedTemplateEntry>,
    author?: AuthorMarker,
  ): Promise<TemplateApplyReport> {
    const rid = await this.resolveProjectId(id);
    let added: AppliedEntry[] = [];
    try {
      await withProjectAuthored(
        this.env.projectHelper,
        this.pl,
        rid,
        author,
        (mut) => {
          added = applyTemplateEntries({
            document,
            placer: mut,
            entries: prepared,
            projectHelper: this.env.projectHelper,
          });
        },
        // Under the same lock an open session's own mutations take, so an apply and a user
        // editing the project cannot interleave.
        { name: "applyTemplateToProject", lockId: `project:${id}` },
      );
    } catch (e: unknown) {
      // A statement about the file: the transaction went with the throw, so the project kept
      // none of the blocks the apply had placed, and `added` is empty by construction.
      // Anything else — a backend that refused the write, say — is not about the file and
      // keeps propagating.
      if (!(e instanceof TemplateEntryRejected)) throw e;
      return { added: [], problems: [{ entryId: e.entryId, error: e.message }] };
    }

    return { added, problems: [] };
  }

  //
  // Template List Manipulation
  //

  private readonly templateIdCache = new LRUCache<TemplateId, SignedResourceId>({ max: 1024 });

  /**
   * Saves a project as a template: a snapshot of its blocks and their params, no data.
   *
   * The document the export produced is what gets stored; the YAML it also rendered is a
   * file format, and a stored template is rendered to it only on download.
   *
   * A block that cannot be expressed as a template entry stores nothing at all, and every
   * such block is reported — fixing an unexportable project takes one pass, not one per block.
   *
   * The template lands beside its project, and is named by the rule everything there is named
   * by: a label the caller chose is stored trimmed and refused if it is already used there, and
   * without one the project's own label is taken — suffixed, since the project itself already
   * answers to it.
   *
   * The template's description is the one the caller gives, stored trimmed; blank means none.
   * Without one the template is stored undescribed, whatever the project's own description says.
   *
   * @param projectId project to snapshot
   * @param label label for the template; defaults to the project's own label, made free
   * @param description what the template is for; blank or absent stores none
   */
  public async saveProjectAsTemplate(
    projectId: ProjectId,
    label?: string,
    description?: string,
  ): Promise<SaveProjectAsTemplateOutcome> {
    const outcome = await this.exportProjectAsTemplate(projectId);
    if (!outcome.ok) return { ok: false, problems: outcome.problems };

    const rid = await this.resolveProjectId(projectId);
    const wanted = label?.trim();
    const signedRid = await this.pl.withWriteTx("MLSaveProjectAsTemplate", async (tx) => {
      const meta = await tx.getKValueJson<ProjectMeta>(rid, ProjectMetaKey);
      const tree = await openFoldersTx(tx, this.foldersRids);
      const taken = tree.namesTakenBeside(projectId);
      if (wanted !== undefined && foldersNameTaken(wanted, taken))
        throw new Error(`"${wanted}" is already used here.`);
      // The project's own label is taken beside it even when the tree cannot say what else is.
      const name = wanted ?? foldersUniqueName(meta.label, [meta.label, ...taken]);

      const tpl = createTemplate(
        tx,
        this.templateListResourceId,
        { label: name, description },
        { schemaVersion: 1, document: outcome.document, sourceProjectLabel: meta.label },
      );

      // A template taken from a project belongs beside that project, and the placement rides the
      // same transaction so the two can never disagree about where it is. Its name was chosen
      // free there, so nothing can send it anywhere else.
      const created = await tpl.globalId;
      tree.place(
        [{ kind: "template", id: asTemplateId(resourceIdToString(created)) }],
        tree.folderOf(projectId),
      );
      await tx.commit();
      return created;
    });
    await Promise.all([this.templateListTree.refreshState(), this.foldersTree.refreshState()]);

    const templateId = asTemplateId(resourceIdToString(signedRid));
    this.templateIdCache.set(templateId, signedRid);
    return { ok: true, templateId };
  }

  /**
   * Changes a template's label. The stored document is immutable and stays untouched —
   * improving a template means saving a new one.
   *
   * The label is stored trimmed. It is in the namespace folders, projects and templates share,
   * so one already used beside the template is refused, in the transaction that writes it.
   */
  public async renameTemplate(id: TemplateId, label: string): Promise<void> {
    const rid = await this.resolveTemplateId(id);
    const wanted = label.trim();
    await this.pl.withWriteTx("MLRenameTemplate", async (tx) => {
      (await openFoldersTx(tx, this.foldersRids)).assertNameFree({ kind: "template", id }, wanted);
      renameTemplate(tx, rid, wanted);
      await tx.commit();
    });
    await this.templateListTree.refreshState();
  }

  /** Sets what a stored template says about itself; blank clears it. The stored document is not
   *  touched, so it stays byte-identical. */
  public async setTemplateDescription(id: TemplateId, description: string): Promise<void> {
    const rid = await this.resolveTemplateId(id);
    await this.pl.withWriteTx("MLSetTemplateDescription", async (tx) => {
      setTemplateDescription(tx, rid, description);
      await tx.commit();
    });
    await this.templateListTree.refreshState();
  }

  /** Permanently deletes a template from the template list. */
  public async deleteTemplate(id: TemplateId): Promise<void> {
    await this.pl.withWriteTx("MLRemoveTemplate", async (tx) => {
      await deleteTemplate(tx, this.templateListResourceId, id);
      await tx.commit();
    });
    this.templateIdCache.delete(id);
    await this.templateListTree.refreshState();
  }

  /** Reads a stored template: its document plus what was true when it was taken. */
  public async getTemplateData(id: TemplateId): Promise<StoredTemplateData> {
    const rid = await this.resolveTemplateId(id);
    return await this.pl.withReadTx("MLGetTemplate", async (tx) => {
      const rd = await tx.getResourceData(rid, false);
      if (rd.data === undefined) throw new Error(`Template ${id} carries no document.`);
      return decodeStoredTemplateData(rd.data);
    });
  }

  /**
   * Where each entry of a stored template would get its block from, and which entries have
   * nowhere to get one — resolution creates nothing, so this is the preview a UI shows before
   * offering Apply. {@link createProjectFromTemplate} runs the same stage itself.
   */
  public async resolveTemplate(
    id: TemplateId,
    provider: BlockPackProvider,
    options: { allowUnstable?: boolean } = {},
  ): Promise<TemplateResolveOutcome> {
    const stored = await this.getTemplateData(id);
    return await resolveTemplateEntries(stored.document, provider, {
      allowUnstable: options.allowUnstable ?? false,
    });
  }

  /**
   * Creates one project holding every block the stored template lists, in the template's order.
   *
   * Resolution and preparation run before the project exists, so a template with an entry
   * nothing can supply a block for leaves no empty project in the list. The one write that
   * follows is all or nothing, and an entry it rejects takes the project with it.
   *
   * @param id template to apply
   * @param label label for the new project
   * @param provider where each entry's block comes from
   * @param options `allowUnstable` widens resolution to pre-release implementations; `folder` is
   *   where the new project lands
   */
  public async createProjectFromTemplate(
    id: TemplateId,
    label: string,
    provider: BlockPackProvider,
    options: {
      allowUnstable?: boolean;
      author?: AuthorMarker;
      /** Where the project lands; the top level when left out. */
      folder?: FolderId;
    } = {},
  ): Promise<CreateProjectFromTemplateOutcome> {
    const stored = await this.getTemplateData(id);

    const preparation = await this.prepareTemplateEntries(stored.document, provider, {
      allowUnstable: options.allowUnstable ?? false,
    });
    if (preparation.problems.length > 0) return { ok: false, problems: preparation.problems };

    const projectId = await this.createProject({ label }, options.folder);
    const report = await this.applyPreparedEntries(
      projectId,
      stored.document,
      preparation.prepared,
      options.author,
    );
    if (report.problems.length > 0) {
      // The apply is one transaction, so the project holds none of the blocks: it is the empty
      // project this call created moments ago and nothing else, and leaving it in the list would
      // show the user a project they never asked for.
      await this.deleteProject(projectId);
      return { ok: false, problems: report.problems };
    }
    return { ok: true, projectId, added: report.added };
  }

  /** Resolves a TemplateId to a signed SignedResourceId.
   * Uses LRU cache with TX-scan fallback. */
  private async resolveTemplateId(templateId: TemplateId): Promise<SignedResourceId> {
    const cached = this.templateIdCache.get(templateId);
    if (cached !== undefined) return cached;

    // Cache miss — scan template list fields to find the matching resource
    const rid = await this.pl.withReadTx("ResolveTemplateId", async (tx) => {
      const entry = (await listedById(tx, this.templateListResourceId)).get(templateId);
      if (entry === undefined) throw notListedError("Template", templateId);
      return entry.rid;
    });

    this.templateIdCache.set(templateId, rid);
    return rid;
  }

  /** Permanently deletes project from the project list, this will result in
   * destruction of all attached objects, like files, analysis results etc. */
  public async deleteProject(id: ProjectId): Promise<void> {
    await this.pl.withWriteTx("MLRemoveProject", async (tx) => {
      const entry = (await listedById(tx, this.projectListResourceId)).get(id);
      if (entry === undefined) throw notListedError("Project", id);
      tx.removeField(field(this.projectListResourceId, entry.fieldName));
      await tx.commit();
    });
    this.projectIdCache.delete(id);
    await this.projectListTree.refreshState();
  }

  /**
   * Duplicates an existing project and adds the copy to this user's project list, beside the
   * project it was copied from.
   *
   * Without `rename` the copy is named by the rule everything beside the source is named by: the
   * source's own label, suffixed to be free there — `X (Copy)`. The name is chosen inside the
   * transaction that creates the copy, against the tree that transaction reads.
   *
   * @param srcProjectId - project id of the project to duplicate
   * @param rename - optional function that receives the source label and all existing
   *   project labels (read within the same transaction), and returns the label for the copy.
   *   A label chosen this way is the caller's and is never suffixed: when it is already taken
   *   beside the source, the copy lands at the top level instead.
   */
  public async duplicateProject(
    srcProjectId: ProjectId,
    rename?: (previousLabel: string, existingLabels: string[]) => string,
  ): Promise<ProjectId> {
    const sourceRid = await this.resolveProjectId(srcProjectId);

    const newPrj: ResourceRef = await this.pl.withWriteTx("MLDuplicateProject", async (tx) => {
      const sourceMeta = await tx.getKValueJson<ProjectMeta>(sourceRid, ProjectMetaKey);
      const tree = await openFoldersTx(tx, this.foldersRids);

      // The source's own label is taken beside it even when the tree cannot say what else is.
      const label =
        rename === undefined
          ? foldersUniqueName(sourceMeta.label, [
              sourceMeta.label,
              ...tree.namesTakenBeside(srcProjectId),
            ])
          : rename(sourceMeta.label, await existingProjectLabels(tx, this.projectListResourceId));

      // The whole source metadata carries over, so a copy keeps what the original said about
      // itself; only the label is the copy's own.
      const newPrj = await duplicateProject(
        tx,
        sourceRid,
        { ...sourceMeta, label },
        this.env.projectHelper,
      );

      // Attach to project list with a random UUID field name
      tx.createField(field(this.projectListResourceId, randomUUID()), "Dynamic", newPrj);

      // A copy belongs beside the project it was copied from, placed in the same transaction so
      // it is never shown at the top level first.
      const created: FoldersLeafItem = {
        kind: "project",
        id: asProjectId(resourceIdToString(await newPrj.globalId)),
      };
      tree.place(
        [created],
        rename === undefined
          ? tree.folderOf(srcProjectId)
          : inheritedFolder(tree.view, srcProjectId, created, label),
      );
      await tx.commit();

      return newPrj;
    });

    await Promise.all([this.projectListTree.refreshState(), this.foldersTree.refreshState()]);

    const signedRid = await newPrj.globalId;
    const newProjectId = asProjectId(resourceIdToString(signedRid));
    this.projectIdCache.set(newProjectId, signedRid);
    return newProjectId;
  }

  /**
   * Duplicates a project into another user's root, minted in the TARGET user's color so the target
   * owns it. Sibling of {@link duplicateProject}, but writes into a different root. The source
   * project (on the current client root) is referenced cross-color for its block data, kept alive
   * by refcounting, exactly like a project copied out of a share. Works both ways: pull (while
   * impersonating a user, copy their project to yourself) and push (from your own root, copy a
   * project to a user). Admin cross-root op; requires the crossTreeRefs:v1 backend capability.
   */
  public async duplicateProjectToUser(
    srcProjectId: ProjectId,
    targetLogin: string,
    rename?: (previousLabel: string, existingLabels: string[]) => string,
  ): Promise<void> {
    if (!this.serverCapabilities.includes("crossTreeRefs:v1"))
      throw new Error("duplicateProjectToUser requires the crossTreeRefs:v1 backend capability.");

    const sourceRid = await this.resolveProjectId(srcProjectId);
    const targetRoot = await this.pl.getUserRoot({ login: targetLogin, createIfNotExists: true });

    // Run on the target root: the tx default color is the target's, so the new project (and the
    // target's project list, if created here) are minted in the target's color.
    await this.pl.withWriteTxOnRoot(targetRoot, "MLDuplicateProjectToUser", async (tx) => {
      // Resolve or lazily create the target root's project list (tx.clientRoot === targetRoot).
      const targetProjectListRid = await ensureProjectListRid(tx);

      // Source label + the target's existing labels, for collision-aware renaming.
      const sourceMeta = await tx.getKValueJson<ProjectMeta>(sourceRid, ProjectMetaKey);
      const existingLabels = await existingProjectLabels(tx, targetProjectListRid);
      const newLabel = rename ? rename(sourceMeta.label, existingLabels) : sourceMeta.label;

      // The whole source metadata carries over, so a copy keeps what the original said about
      // itself; only the label is the copy's own.
      const newPrj = await duplicateProject(
        tx,
        sourceRid,
        { ...sourceMeta, label: newLabel },
        this.env.projectHelper,
      );
      tx.createField(field(targetProjectListRid, randomUUID()), "Dynamic", newPrj);
      await tx.commit();
    });
  }

  //
  // Project Sharing (Copy & Share)
  //

  /**
   * Shares the given projects (Copy & Share): snapshots them into one envelope, in the transaction
   * {@link shareEnvelope} describes.
   *
   * v1 always passes `mode: "copy"`.
   */
  public async shareProjects(
    projectIds: ProjectId[],
    options: ShareProjectsOptions,
  ): Promise<ShareOutcome> {
    if (projectIds.length === 0) throw new Error("shareProjects: no projects given");

    const sources: EnvelopeProjectSource[] = await Promise.all(
      projectIds.map(
        async (id): Promise<EnvelopeProjectSource> => ({
          projectId: id,
          sourceRid: await this.resolveProjectId(id),
        }),
      ),
    );

    return await this.shareEnvelope("MLShareProjects", options, { writable: true }, (tx, meta) =>
      buildShareEnvelope(tx, this.sharingOutboxResourceId, sources, {
        mode: options.mode,
        ...meta,
      }),
    );
  }

  /**
   * Shares one stored template. The envelope carries the document itself, so there is no project
   * snapshot and no resource for the recipient to copy out — which is why the grant is read-only.
   *
   * Nothing about the document is checked: a stored template is shareable by virtue of existing.
   * An entry the recipient cannot resolve — a block installed from a folder on the sender's
   * machine, say — is theirs to see when they preview or apply it, where every unresolvable entry
   * is named anyway.
   *
   * @param id template to share
   * @param options recipients XOR everyone, plus the title recipients see
   */
  public async shareTemplate(id: TemplateId, options: ShareTemplateOptions): Promise<ShareOutcome> {
    const rid = await this.resolveTemplateId(id);
    const stored = await this.pl.withReadTx("MLReadStoredTemplate", (tx) =>
      readStoredTemplate(tx, id, rid),
    );

    return await this.shareEnvelope("MLShareTemplate", options, { writable: false }, (tx, meta) =>
      buildTemplateShareEnvelope(
        tx,
        this.sharingOutboxResourceId,
        {
          document: stored.data.document,
          label: stored.label,
          ...(stored.description === undefined ? {} : { description: stored.description }),
          source: id,
        },
        meta,
      ),
    );
  }

  /**
   * Shares one folder and everything under it: the subtree's folders, every project in them
   * snapshotted, and every template carried whole.
   *
   * The grant is writable, because a folder holding projects is copied out of the envelope the
   * way a project pack is. An everyone-share of a folder therefore hands every user on the server
   * write access to the envelope — the same trade a project share already makes.
   *
   * Folder ids do not travel. What the recipient gets is the shape of the subtree, rebuilt under
   * a folder of their own choosing with ids their own document mints.
   *
   * @param folder folder to share; everything beneath it goes with it
   * @param options recipients XOR everyone, plus the title recipients see
   */
  public async shareFolder(folder: FolderId, options: ShareFolderOptions): Promise<ShareOutcome> {
    const loaded = await this.loadFolderSubtree(folder, newEnvelopeFolderId);
    const subtree: EnvelopeFolderSubtree = {
      source: folder,
      folders: loaded.folders,
      projects: loaded.projects.map((project) => ({
        projectId: project.projectId,
        sourceRid: project.rid,
        folder: project.folder,
      })),
      templates: loaded.templates.map((template) => ({
        document: template.data.document,
        label: template.label,
        ...(template.description === undefined ? {} : { description: template.description }),
        folder: template.folder,
      })),
    };

    return await this.shareEnvelope("MLShareFolder", options, { writable: true }, (tx, meta) =>
      buildFolderShareEnvelope(tx, this.sharingOutboxResourceId, subtree, meta),
    );
  }

  /**
   * The one transaction every share is made in: the shares named by `options.replace` are
   * dropped, the envelope `build` makes is created, and it is granted — all at once, so a failed
   * grant rolls the whole thing back and the outbox is left as it was.
   *
   * A share with named recipients grants each of them and expires after the default TTL
   * (`sharedAt + envelopeTtlMs`). A share with everyone is one make-public grant, and its
   * `expiresAt` is `null`, so it never expires.
   */
  private async shareEnvelope(
    txName: string,
    options: ShareOptions,
    permissions: { writable: boolean },
    build: (
      tx: PlTransaction,
      meta: { sender: string; title: string; expiresAt: number | null },
    ) =>
      | { envelope: ResourceRef; data: EnvelopeData }
      | Promise<{ envelope: ResourceRef; data: EnvelopeData }>,
  ): Promise<ShareOutcome> {
    const everyone = "everyone" in options;
    const meta = {
      sender: this.currentUserLogin ?? "",
      title: options.title,
      expiresAt: everyone ? null : Date.now() + this.env.ops.envelopeTtlMs,
    };

    const outcome = await this.pl.withWriteTx(txName, async (tx) => {
      await this.dropShares(tx, options.replace);
      const { envelope, data } = await build(tx, meta);
      await this.grantShareEnvelope(
        tx,
        envelope,
        everyone,
        everyone ? [] : options.recipients,
        permissions,
      );
      await tx.commit();
      return { shareId: data.shareId };
    });

    await this.sharingOutboxTree.refreshState();
    return outcome;
  }

  /**
   * Detaches the named shares from the donor's outbox inside the caller's transaction, so a
   * replacement and the shares it supersedes land together or not at all.
   *
   * A share that no longer resolves is skipped rather than reported: the caller names shares the
   * author saw a moment ago, and one revoked meanwhile is already in the wanted state.
   */
  private async dropShares(tx: PlTransaction, shareIds: ShareId[] | undefined): Promise<void> {
    for (const shareId of shareIds ?? []) {
      const target = await this.resolveOutboxEnvelope(tx, shareId);
      if (target === undefined) continue;
      tx.removeField(field(this.sharingOutboxResourceId, target.fieldName));
    }
  }

  /**
   * Grants one freshly built envelope inside the transaction that created it: a single make-public
   * grant for an everyone-share (empty/ignored target, ANY_AUTHORISED — the backend rewrites the
   * target to the everyone-user, gated by role + permission ceiling), or one grant per named
   * recipient.
   *
   * `writable` is not a preference. A project pack needs a writable grant because a copy out of
   * it takes the snapshots out of the envelope, and the cross-color attach rule permits that only
   * to a writable grant holder. A template share copies nothing — the document sits in the
   * envelope's own immutable data — so it is granted read-only, and must be: a writable
   * everyone-grant would hand every user on the server write access to the envelope.
   */
  private async grantShareEnvelope(
    tx: PlTransaction,
    envelope: ResourceRef,
    everyone: boolean,
    recipients: string[],
    permissions: { writable: boolean },
  ): Promise<void> {
    const gid = await envelope.globalId;
    if (everyone) tx.grantAccess(gid, "", permissions, GrantType.ANY_AUTHORISED);
    else for (const r of recipients) tx.grantAccess(gid, r, permissions);
  }

  /**
   * Revokes and deletes an outgoing share for all recipients: detaches and deletes the envelope, and
   * its grants are revoked along with it. Copies recipients already took out of it are unaffected
   * (ref-counting keeps the resources they point at alive). Idempotent — revoking a share that is
   * already gone is a no-op.
   */
  public async revokeShare(shareId: ShareId): Promise<void> {
    await this.pl.withWriteTx("MLRevokeShare", async (tx) => {
      const target = await this.resolveOutboxEnvelope(tx, shareId);
      if (target === undefined) return;
      tx.removeField(field(this.sharingOutboxResourceId, target.fieldName));
      await tx.commit();
    });

    await this.sharingOutboxTree.refreshState();
  }

  /**
   * Resolves a live envelope from the donor's own outbox by its logical `shareId`, returning the
   * outbox field name (for detach), the signed envelope id, and its decoded {@link EnvelopeData}.
   * The outbox is keyed by `{shareId}` directly, but a replaced/legacy share may have drifted, so
   * we match on the decoded `shareId` rather than the field name alone.
   */
  private async resolveOutboxEnvelope(
    tx: PlTransaction,
    shareId: ShareId,
  ): Promise<{ fieldName: string; rid: SignedResourceId; data: EnvelopeData } | undefined> {
    const outboxData = await tx.getResourceData(this.sharingOutboxResourceId, true);
    for (const f of outboxData.fields) {
      if (isNullSignedResourceId(f.value)) continue;
      const rd = await tx.getResourceData(f.value, false);
      if (rd.data === undefined) continue;
      const data = decodeEnvelopeData(rd.data);
      if (data === undefined) continue;
      if (data.shareId === shareId) return { fieldName: f.name, rid: f.value, data };
    }
    return undefined;
  }

  /**
   * Resolves currently-shared envelopes (granted to this user) to their resource ids, keyed by
   * the envelope's logical `shareId`.
   *
   * Reads the {@link liveEnvelopes} Computable — the same shared-resource discovery tree that
   * feeds {@link availableShares}. This is the single discovery mechanism: there is no separate
   * `ListUserResources` re-stream on every copy. `refreshState()` is awaited first so a
   * just-granted envelope is observed (the tree's discovery poll may otherwise lag a freshly
   * landed grant). The tree is gRPC-only, so this is empty on a REST-connected client.
   */
  private async resolveLiveEnvelopes(): Promise<Map<ShareId, LiveEnvelope>> {
    await this.availableSharesTree.refreshState();
    const live = (await this.liveEnvelopes.getValue()) ?? [];
    // Dedup by logical shareId (last writer wins — at most one live envelope per shareId).
    const map = new Map<ShareId, LiveEnvelope>();
    for (const e of live) map.set(e.data.shareId, e);
    return map;
  }

  /**
   * Copies what one or more shares carry into this user's own tree, optionally into a folder.
   *
   * A share is a shelf, not an invitation: copying takes nothing off it and records no decision,
   * so the same share can be copied from again, by this user or anyone else it was granted to.
   * What a copy produces depends on the payload — a pack of projects lands in the project list,
   * a template among their templates, building nothing until the recipient applies it, and a
   * folder is rebuilt whole with everything it held.
   *
   * Names are chosen against the destination folder, since that is where the uniqueness rule
   * applies, and a project and a template follow the same rule. A destination deleted meanwhile
   * fails the copy rather than spilling it at the top level.
   * Per-share failures (a revoked envelope, say) are collected rather than short-circuited, so
   * one dead share does not cost the others.
   */
  public async copyShare(
    shareIds: ShareId[],
    destination?: FolderId,
  ): Promise<{
    projects: ProjectId[];
    templates: TemplateId[];
    failed: { shareId: ShareId; error: string }[];
  }> {
    const live = await this.resolveLiveEnvelopes();

    const projects: ProjectId[] = [];
    const templates: TemplateId[] = [];
    const failed: { shareId: ShareId; error: string }[] = [];

    for (const shareId of shareIds) {
      const envelope = live.get(shareId);
      if (envelope === undefined) {
        failed.push({ shareId, error: "Share is no longer available." });
        continue;
      }
      try {
        const payload = envelope.data.payload;

        if (payload.kind === "template") {
          const rid = await this.pl.withWriteTx("MLCopyTemplateShare", async (tx) => {
            const tree = await openFoldersTx(tx, this.foldersRids);
            // The template lands in their templates, keeping who sent it as its provenance, under
            // a name that is free where it lands — the same rule a copied project follows. What
            // the donor said about the template is part of the template, not of the share.
            const tpl = createTemplate(
              tx,
              this.templateListResourceId,
              {
                label: foldersUniqueName(payload.label, tree.namesTakenIn(destination)),
                description: payload.description,
              },
              { schemaVersion: 1, document: payload.document, sender: payload.from },
            );

            const created = await tpl.globalId;
            tree.place(
              [{ kind: "template", id: asTemplateId(resourceIdToString(created)) }],
              destination,
            );

            await tx.commit();
            return created;
          });

          const templateId = asTemplateId(resourceIdToString(rid));
          this.templateIdCache.set(templateId, rid);
          templates.push(templateId);
          continue;
        }

        if (payload.kind === "folder") {
          const root = envelopeFolderRoot(payload.folders);
          if (root === undefined)
            throw new Error("This share does not describe one folder, so nothing can be rebuilt.");

          const copied = await this.pl.withWriteTx("MLCopyFolderShare", async (tx) => {
            const tree = await openFoldersTx(tx, this.foldersRids);
            // The subtree is rebuilt whole, so names are only ever compared inside it — except
            // the root, which lands beside whatever the destination already holds.
            const created = await copyEnvelopeProjectsIntoList(
              tx,
              envelope.rid,
              this.projectListResourceId,
            );

            const createdTemplates: TemplateId[] = [];
            const items: (FoldersLeafItem & { folder: string })[] = [];
            for (const { uuid, rid } of created) {
              const inFolder = payload.projects[uuid];
              items.push({
                kind: "project",
                id: asProjectId(resourceIdToString(rid)),
                // A project whose payload entry is missing still exists; it lands at the root.
                folder: inFolder?.folder ?? root,
              });
            }

            for (const carried of payload.templates) {
              // The template lands in their templates, keeping who sent it as its provenance.
              const tpl = createTemplate(
                tx,
                this.templateListResourceId,
                { label: carried.label, description: carried.description },
                { schemaVersion: 1, document: carried.document, sender: payload.from },
              );
              const id = asTemplateId(resourceIdToString(await tpl.globalId));
              createdTemplates.push(id);
              items.push({ kind: "template", id, folder: carried.folder });
            }

            // Folders this build cannot rewrite leave the subtree unbuilt, and the copies land at
            // the top level. That is deliberate: folders are an arrangement, not the content, and
            // a copy the user asked for is not held back for their sake.
            tree.graft({ root, folders: payload.folders, items }, destination);

            await tx.commit();
            return { projects: created, templates: createdTemplates };
          });

          for (const { rid } of copied.projects) {
            const projectId = asProjectId(resourceIdToString(rid));
            this.projectIdCache.set(projectId, rid);
            projects.push(projectId);
          }
          templates.push(...copied.templates);
          continue;
        }

        const createdRids = await this.pl.withWriteTx("MLCopyShare", async (tx) => {
          const tree = await openFoldersTx(tx, this.foldersRids);
          // Scoped to where the copies are going, because that is the only place their names have
          // to be free. `taken` grows as the pack is copied, so two projects of one name inside a
          // single share do not land on top of each other either.
          const taken = [...tree.namesTakenIn(destination)];
          const created = await copyEnvelopeProjectsIntoList(
            tx,
            envelope.rid,
            this.projectListResourceId,
            (sourceLabel) => {
              const name = foldersUniqueName(sourceLabel, taken);
              taken.push(name);
              return name;
            },
          );

          tree.place(
            created.map(({ rid }) => ({
              kind: "project" as const,
              id: asProjectId(resourceIdToString(rid)),
            })),
            destination,
          );

          await tx.commit();
          return created;
        });
        for (const { rid } of createdRids) {
          const projectId = asProjectId(resourceIdToString(rid));
          this.projectIdCache.set(projectId, rid);
          projects.push(projectId);
        }
      } catch (e) {
        failed.push({ shareId, error: e instanceof Error ? e.message : String(e) });
      }
    }

    await Promise.all([
      this.projectListTree.refreshState(),
      this.templateListTree.refreshState(),
      this.foldersTree.refreshState(),
    ]);
    return { projects, templates, failed };
  }

  /**
   * Puts a share out of this user's sight. Private to them and reversible with
   * {@link unhideShare}: nothing is deleted, the donor is not told, and what was already copied
   * out of it is unaffected.
   */
  public async hideShare(shareId: ShareId): Promise<void> {
    const now = Date.now();
    await this.pl.withWriteTx("MLHideShare", async (tx) => {
      writeShareHidden(tx, this.sharingStateResourceId, shareId, now);
      await tx.commit();
    });

    await this.sharingStateTree.refreshState();
  }

  /** Brings a hidden share back into this user's list. */
  public async unhideShare(shareId: ShareId): Promise<void> {
    await this.pl.withWriteTx("MLUnhideShare", async (tx) => {
      clearShareHidden(tx, this.sharingStateResourceId, shareId);
      await tx.commit();
    });

    await this.sharingStateTree.refreshState();
  }

  //
  // Outbox cleanup (donor side)
  //

  private static readonly EnvelopeCleanupIntervalMs = 6 * 3600 * 1000; // every 6h
  private envelopeCleanupTimer: ReturnType<typeof setInterval> | undefined;

  /** On ML start and every 6h, delete envelopes whose immutable `expiresAt` has passed. */
  private startEnvelopeCleanup(): void {
    void this.runEnvelopeCleanup();
    this.envelopeCleanupTimer = setInterval(() => {
      void this.runEnvelopeCleanup();
    }, MiddleLayer.EnvelopeCleanupIntervalMs);
    // Don't keep the process alive solely for cleanup.
    this.envelopeCleanupTimer.unref?.();
  }

  /** Scans the donor's outbox and deletes expired envelopes (backend auto-revokes their grants).
   *  Envelopes with `expiresAt: null` (share-with-everybody) are skipped. */
  private async runEnvelopeCleanup(): Promise<void> {
    try {
      const now = Date.now();
      const expired = await this.pl.withReadTx("MLEnvelopeCleanupScan", async (tx) => {
        const data = await tx.getResourceData(this.sharingOutboxResourceId, true);
        const toDelete: { fieldName: string }[] = [];
        for (const f of data.fields) {
          if (isNullSignedResourceId(f.value)) continue;
          const rd = await tx.getResourceData(f.value, false);
          if (rd.data === undefined) continue;
          const envData = decodeEnvelopeData(rd.data);
          if (envData === undefined) continue;
          if (envData.expiresAt === null) continue; // never expires
          if (envData.expiresAt <= now) toDelete.push({ fieldName: f.name });
        }
        return toDelete;
      });

      if (expired.length === 0) return;

      await this.pl.withWriteTx("MLEnvelopeCleanup", async (tx) => {
        for (const { fieldName } of expired)
          tx.removeField(field(this.sharingOutboxResourceId, fieldName));
        await tx.commit();
      });

      await this.sharingOutboxTree.refreshState();
    } catch (e) {
      this.env.logger.warn(
        `envelope cleanup failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  //
  // Projects
  //

  private readonly openedProjects = new Map<ProjectId, Project>();

  /** Snapshot writes started by {@link closeProject} and not yet finished. Held only so
   *  {@link close} can give them a bounded chance to land. */
  private readonly pendingSnapshotWrites = new Set<Promise<void>>();

  private trackSnapshotWrite(write: Promise<void>): void {
    this.pendingSnapshotWrites.add(write);
    void write.finally(() => this.pendingSnapshotWrites.delete(write));
  }

  /** Waits for close-boundary snapshot writes that are already running, up to `timeoutMs`.
   *
   * This starts no work: quitting still performs no snapshot of its own. It only lets a write
   * that a project close already began finish, so closing a project and immediately quitting
   * does not routinely lose it. Bounded, because a wedged filesystem must not hang the quit,
   * and losing the write costs one cold open rather than any correctness. */
  private async drainSnapshotWrites(timeoutMs: number): Promise<void> {
    if (this.pendingSnapshotWrites.size === 0) return;

    let timer: NodeJS.Timeout | undefined;
    const expiry = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
      timer.unref?.();
    });
    try {
      await Promise.race([Promise.allSettled(this.pendingSnapshotWrites), expiry]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

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

    // Snapshot before destroy, and here rather than inside destroy(): destroy() is also what
    // application shutdown runs, and quitting should perform no snapshot work. Terminating the
    // tree invalidates it, so the state has to be taken first either way.
    //
    // Started, not awaited. The capture happens synchronously inside, which is the part that
    // needs the tree alive; the encode and write are up to ten megabytes of work that closing a
    // project should not sit behind. Kept so shutdown can drain it.
    this.trackSnapshotWrite(prj.snapshotOnClose());

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

  /** Counters for the persisted project tree mirrors, or undefined when they are switched off.
   *  Reads and hits are what show whether a reopen was actually warm, and the miss breakdown
   *  says why it was not. */
  public get treeSnapshotStats(): Readonly<TreeSnapshotStat> | undefined {
    return this.env.treeSnapshots?.getStats();
  }

  /**
   * Deallocates all runtime resources consumed by this object and awaits
   * actual termination of event loops and other processes associated with
   * them.
   */
  public async close() {
    if (this.envelopeCleanupTimer !== undefined) clearInterval(this.envelopeCleanupTimer);
    await Promise.all([...this.openedProjects.values()].map((prj) => prj.destroy()));
    // this.env.quickJs;
    await Promise.all([
      this.projectListTree.terminate(),
      this.templateListTree.terminate(),
      this.foldersTree.terminate(),
      this.sharingOutboxTree.terminate(),
      this.sharingStateTree.terminate(),
      this.availableSharesTree.terminate(),
    ]);
    await this.drainSnapshotWrites(SNAPSHOT_DRAIN_TIMEOUT_MS);
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
    // apply MI_TREE_TRAVERSAL only when the embedder hasn't set an explicit mode
    if (
      ops.defaultTreeOptions.traversalMode === undefined &&
      getDebugFlags().treeTraversalMode !== undefined
    )
      ops.defaultTreeOptions.traversalMode = getDebugFlags().treeTraversalMode;

    const { projects, templates, sharingOutbox, sharingState, folders } = await pl.withWriteTx(
      "MLInitialization",
      async (tx) => {
        // Lazily create each clientRoot-attached singleton resource. Returns the existing
        // resource id if the field is already populated, otherwise creates + locks + sets it.
        // A created resource's id is known only once the transaction commits.
        type Singleton = { existing: SignedResourceId } | { ref: ResourceRef };
        const lazyInit = async (
          fieldName: string,
          type: { name: string; version: string },
        ): Promise<Singleton> => {
          const f = field(tx.clientRoot, fieldName);
          tx.createField(f, "Dynamic");
          const fData = await tx.getField(f);
          if (isNullSignedResourceId(fData.value)) {
            const ref = tx.createEphemeral(type);
            tx.lock(ref);
            tx.setField(f, ref);
            return { ref };
          }
          return { existing: fData.value };
        };

        const projectsR = await lazyInit(ProjectsField, ProjectsResourceType);
        const templatesR = await lazyInit(TemplatesField, TemplatesResourceType);
        const outboxR = await lazyInit(SharingOutboxField, SharingOutboxResourceType);
        const stateR = await lazyInit(SharingStateField, SharingStateResourceType);
        // The folder tree gets its own root-attached singleton rather than a field on the
        // projects resource: an extra field there is walked by the released project-list reader
        // and dereferenced as a project, which takes the whole list down, not just the folders.
        const foldersR = await lazyInit(FoldersField, FoldersResourceType);

        await tx.commit();

        const idOf = async (r: Singleton) => ("existing" in r ? r.existing : await r.ref.globalId);
        return {
          projects: await idOf(projectsR),
          templates: await idOf(templatesR),
          sharingState: await idOf(stateR),
          sharingOutbox: await idOf(outboxR),
          folders: await idOf(foldersR),
        };
      },
    );

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
    runtimeCapabilities.addSupportedRequirement("requiresPFramesVersion", REQUIRES_PFRAMES_VERSION);
    registerServiceCapabilities((flag, value) =>
      runtimeCapabilities.addSupportedRequirement(flag, value),
    );
    // runtime capabilities of the desktop are to be added by the desktop app / test framework

    const serviceRegistry = createModelServiceRegistry({ logger });

    const treeSnapshots = TreeSnapshotStore.create(pl, {
      dir: ops.treeSnapshotPath,
      maxSizeBytes: ops.treeSnapshotOps.maxSizeBytes,
      enabled: ops.treeSnapshotOps.enabled,
      logger,
    });
    if (ops.treeSnapshotOps.enabled) {
      // Housekeeping before any project opens: drop snapshots from other builds, backends and
      // users, then trim to the ceiling.
      await treeSnapshots?.evict();
    } else {
      // Switched off, so reclaim what earlier sessions left on disk. The reason to reach for
      // this switch is usually the disk itself, and leaving the files behind would answer the
      // wrong half of that complaint. Keyed on the setting, not on the store being absent: it
      // is also absent for an impersonated client, whose session must not delete anything.
      await TreeSnapshotStore.purge(ops.treeSnapshotPath, logger);
    }

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
      treeSnapshots,
      dispose: async () => {
        await serviceRegistry.dispose();
        await retryHttpDispatcher.destroy();
        await driverKit.dispose();
      },
    };

    const openedProjects = new WatchableValue<ProjectId[]>([]);
    const projectListTC = await createProjectList(pl, projects, openedProjects, env);
    const templateListTC = await createTemplateList(pl, templates, env);
    const foldersTC = await createFolderList(
      pl,
      folders,
      projectListTC.tree,
      templateListTC.tree,
      openedProjects,
      env,
    );

    // Project sharing trees and reactive views.
    const outgoingTC = await createOutgoingShares(pl, sharingOutbox, env);
    const sharingStateTree = await createSharingStateTree(pl, sharingState, env);
    const availableSharesTree = await createAvailableSharesTree(pl, env);
    const availableShares = createAvailableSharesComputable(
      availableSharesTree,
      sharingStateTree,
      pl.userResources.authUser,
    );
    const liveEnvelopes = createLiveEnvelopesComputable(availableSharesTree);

    return new MiddleLayer(
      env,
      driverKit,
      driverKit.signer,
      projects,
      templates,
      sharingOutbox,
      sharingState,
      folders,
      openedProjects,
      projectListTC.tree,
      templateListTC.tree,
      foldersTC.tree,
      outgoingTC.tree,
      sharingStateTree,
      availableSharesTree,
      v2RegistryProvider,
      projectListTC.computable,
      templateListTC.computable,
      foldersTC.computable,
      outgoingTC.computable,
      availableShares,
      liveEnvelopes,
    );
  }
}

//
// Internals
//

/** A folder subtree read for copying; see {@link MiddleLayer.loadFolderSubtree}. */
interface FolderSubtree<Id extends string> {
  /** Folder holding the subtree's root; absent when the root is at the top level. */
  readonly parent?: FolderId;
  /** Local key of the subtree's root. */
  readonly root: Id;
  readonly folders: Record<Id, { name: string; parent?: Id; description?: string }>;
  readonly projects: { projectId: ProjectId; rid: SignedResourceId; folder: Id }[];
  readonly templates: (StoredTemplate & { folder: Id })[];
}

/** Everything a stored template is: its immutable blob, plus the label and the description the
 *  list shows, both of which live beside the blob rather than in it. */
interface StoredTemplate {
  readonly data: StoredTemplateData;
  readonly label: string;
  /** Absent when nobody described the template. */
  readonly description?: string;
}

/** Reads one stored template within the caller's transaction. A share carries its document on;
 *  a duplicate carries the blob whole, so the copy says of itself what the original did. */
async function readStoredTemplate(
  tx: PlTransaction,
  id: TemplateId,
  rid: SignedResourceId,
): Promise<StoredTemplate> {
  const rd = await tx.getResourceData(rid, false);
  if (rd.data === undefined) throw new Error(`Template ${id} carries no document.`);
  const [label, description] = await Promise.all([
    tx.getKValueJson<string>(rid, TemplateLabelKey),
    tx.getKValueJsonIfExists<string>(rid, TemplateDescriptionKey).then(normalizeDescription),
  ]);
  return {
    data: decodeStoredTemplateData(rd.data),
    label,
    ...(description === undefined ? {} : { description }),
  };
}

/** The label of every project in a project list, read within the caller's transaction. */
async function existingProjectLabels(
  tx: PlTransaction,
  listRid: SignedResourceId,
): Promise<string[]> {
  const listed = await listedById(tx, listRid);
  const metas = await Promise.all(
    [...listed.values()].map(({ rid }) => tx.getKValueJson<ProjectMeta>(rid, ProjectMetaKey)),
  );
  return metas.map((meta) => meta.label);
}
