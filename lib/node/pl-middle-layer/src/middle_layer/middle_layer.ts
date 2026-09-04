import type {
  PlClient,
  PlTransaction,
  SignedResourceId,
  ResourceRef,
  Role,
} from "@milaboratories/pl-client";
import {
  isEveryoneUserLogin,
  field,
  GrantType,
  isNotNullSignedResourceId,
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
import type {
  CreateProjectFromTemplateOutcome,
  SaveProjectAsTemplateOutcome,
  ShareTemplateOutcome,
  StoredTemplateData,
  TemplateId,
  TemplateListEntry,
} from "./template_list";
import {
  createTemplateList,
  decodeStoredTemplateData,
  TemplateLabelKey,
  TemplatesField,
  TemplatesResourceType,
} from "./template_list";
import { createTemplate, deleteTemplate, renameTemplate } from "../mutator/template";
import {
  createProject,
  duplicateProject,
  withProject,
  withProjectAuthored,
} from "../mutator/project";
import type { ProjectTemplateExportOutcome } from "../model/template_serializer";
import type { ProjectTemplateV1 } from "@milaboratories/pl-model-common";
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
  acceptanceFieldLogin,
  canGrantToEveryone,
  canImpersonate,
  decodeEnvelopeData,
  envelopeProjectMap,
  isAcceptanceField,
  SharingOutboxField,
  SharingOutboxResourceType,
  SharingStateField,
  SharingStateResourceType,
  type EnvelopeAcceptance,
  type EnvelopeData,
  type ProjectChangeAction,
  type ProjectFieldUuid,
  type ShareId,
  type ShareProjectsOptions,
  type ShareTemplateOptions,
} from "../model/sharing_model";
import type { TemplateShareProblem } from "../model/template_share";
import { unshareableTemplateEntries } from "../model/template_share";
import {
  buildShareEnvelope,
  buildTemplateShareEnvelope,
  copyEnvelopeProjectsIntoList,
  envelopeProjectFieldUuid,
  isEnvelopeProjectField,
  resourceIdsToStrings,
  writeEnvelopeAcceptance,
  writeSharingDecision,
  type EnvelopeProjectSource,
} from "../mutator/sharing";
import type { LiveEnvelope, OutgoingShare, PendingShare } from "./sharing_list";
import {
  createLiveEnvelopesComputable,
  createOutgoingShares,
  createPendingSharesComputable,
  createPendingSharesTree,
  createSharingStateTree,
} from "./sharing_list";
import { BlockPackPreparer } from "../mutator/block-pack/block_pack";
import type { MiLogger, Signer } from "@milaboratories/ts-helpers";
import { BlockEventDispatcher, cachedDeserialize } from "@milaboratories/ts-helpers";
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
    private readonly openedProjectsList: WatchableValue<ProjectId[]>,
    private readonly projectListTree: SynchronizedTreeState,
    private readonly templateListTree: SynchronizedTreeState,
    private readonly sharingOutboxTree: SynchronizedTreeState,
    private readonly sharingStateTree: SynchronizedTreeState,
    private readonly pendingSharesTree: SynchronizedTreeState,
    public readonly blockRegistryProvider: V2RegistryProvider,
    /** Contains a reactive list of projects along with their meta information. */
    public readonly projectList: ComputableStableDefined<ProjectListEntry[]>,
    /** Contains a reactive list of stored templates along with their labels and provenance. */
    public readonly templateList: ComputableStableDefined<TemplateListEntry[]>,
    /** Reactive view of the donor's outbox — the shares this user has created.
     *  v1: API only, no UI. */
    public outgoingShares: Computable<OutgoingShare[] | undefined>,
    /** Envelopes granted to this user, not yet accepted or rejected. Fed by the
     *  shared-resource discovery tree. */
    public pendingShares: Computable<PendingShare[] | undefined>,
    /** Internal: the acceptor's currently-live envelopes, read from the same shared-resource
     *  discovery tree as {@link pendingShares}. The single source the accept/reject flow resolves
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
   * cross-color field-reference relaxation the accept flow rests on). It can absorb
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
      const data = await tx.getResourceData(this.projectListResourceId, true);
      for (const f of data.fields) {
        if (isNullSignedResourceId(f.value)) continue;
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
   * @param projectId project to snapshot
   * @param label label for the template; defaults to the project's own label
   */
  public async saveProjectAsTemplate(
    projectId: ProjectId,
    label?: string,
  ): Promise<SaveProjectAsTemplateOutcome> {
    const outcome = await this.exportProjectAsTemplate(projectId);
    if (!outcome.ok) return { ok: false, problems: outcome.problems };

    const rid = await this.resolveProjectId(projectId);
    let tpl: ResourceRef;
    await this.pl.withWriteTx("MLSaveProjectAsTemplate", async (tx) => {
      const meta = await tx.getKValueJson<ProjectMeta>(rid, ProjectMetaKey);
      tpl = createTemplate(tx, this.templateListResourceId, label ?? meta.label, {
        schemaVersion: 1,
        document: outcome.document,
        sourceProjectLabel: meta.label,
      });
      await tx.commit();
    });
    await this.templateListTree.refreshState();

    const signedRid = await tpl!.globalId;
    const templateId = resourceIdToString(signedRid) as TemplateId;
    this.templateIdCache.set(templateId, signedRid);
    return { ok: true, templateId };
  }

  /** Changes a template's label. The stored document is immutable and stays untouched —
   *  improving a template means saving a new one. */
  public async renameTemplate(id: TemplateId, label: string): Promise<void> {
    const rid = await this.resolveTemplateId(id);
    await this.pl.withWriteTx("MLRenameTemplate", async (tx) => {
      renameTemplate(tx, rid, label);
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
   * @param options `allowUnstable` widens resolution to pre-release implementations
   */
  public async createProjectFromTemplate(
    id: TemplateId,
    label: string,
    provider: BlockPackProvider,
    options: { allowUnstable?: boolean; author?: AuthorMarker } = {},
  ): Promise<CreateProjectFromTemplateOutcome> {
    const stored = await this.getTemplateData(id);

    const preparation = await this.prepareTemplateEntries(stored.document, provider, {
      allowUnstable: options.allowUnstable ?? false,
    });
    if (preparation.problems.length > 0) return { ok: false, problems: preparation.problems };

    const projectId = await this.createProject({ label });
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
      const data = await tx.getResourceData(this.templateListResourceId, true);
      for (const f of data.fields) {
        if (isNullSignedResourceId(f.value)) continue;
        if (resourceIdToString(f.value) === (templateId as string)) return f.value;
      }
      throw new Error(`Template ${templateId} not found in template list.`);
    });

    this.templateIdCache.set(templateId, rid);
    return rid;
  }

  /** Permanently deletes project from the project list, this will result in
   * destruction of all attached objects, like files, analysis results etc. */
  public async deleteProject(id: ProjectId): Promise<void> {
    await this.pl.withWriteTx("MLRemoveProject", async (tx) => {
      const data = await tx.getResourceData(this.projectListResourceId, true);
      let fieldName: string | undefined;
      for (const f of data.fields) {
        if (isNullSignedResourceId(f.value)) continue;
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

    const newPrj: ResourceRef = await this.pl.withWriteTx("MLDuplicateProject", async (tx) => {
      // Read source project meta
      const sourceMeta = await tx.getKValueJson<ProjectMeta>(sourceRid, ProjectMetaKey);

      // Read all existing project labels from the project list (parallel reads)
      const projectListData = await tx.getResourceData(this.projectListResourceId, true);
      const projectRids = projectListData.fields
        .map((f) => f.value)
        .filter(isNotNullSignedResourceId);
      const existingLabels = (
        await Promise.all(
          projectRids.map((rid) => tx.getKValueJson<ProjectMeta>(rid, ProjectMetaKey)),
        )
      ).map((m) => m.label);

      // Compute new label
      const newLabel = rename ? rename(sourceMeta.label, existingLabels) : sourceMeta.label;

      // Create the duplicate
      const newPrj = await duplicateProject(
        tx,
        sourceRid,
        { label: newLabel },
        this.env.projectHelper,
      );

      // Attach to project list with a random UUID field name
      tx.createField(field(this.projectListResourceId, randomUUID()), "Dynamic", newPrj);
      await tx.commit();

      return newPrj;
    });

    await this.projectListTree.refreshState();

    const signedRid = await newPrj.globalId;
    const newProjectId = resourceIdToString(signedRid) as ProjectId;
    this.projectIdCache.set(newProjectId, signedRid);
    return newProjectId;
  }

  /**
   * Duplicates a project into another user's root, minted in the TARGET user's color so the target
   * owns it. Sibling of {@link duplicateProject}, but writes into a different root. The source
   * project (on the current client root) is referenced cross-color for its block data, kept alive
   * by refcounting, exactly like accepting a shared project. Works both ways: pull (while
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
      const targetListData = await tx.getResourceData(targetProjectListRid, true);
      const existingLabels = (
        await Promise.all(
          targetListData.fields
            .map((f) => f.value)
            .filter(isNotNullSignedResourceId)
            .map((rid) => tx.getKValueJson<ProjectMeta>(rid, ProjectMetaKey)),
        )
      ).map((m) => m.label);
      const newLabel = rename ? rename(sourceMeta.label, existingLabels) : sourceMeta.label;

      const newPrj = await duplicateProject(
        tx,
        sourceRid,
        { label: newLabel },
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
   * Shares the given projects (Copy & Share). Snapshots the projects, creates one envelope, and
   * grants it — all in one atomic write transaction, so a failed grant rolls the whole thing back
   * and the outbox is left as it was.
   *
   * Two variants (see {@link ShareProjectsOptions}):
   * - `{ recipients }` — one writable grant per named recipient; the envelope expires after the
   *   default TTL (`sharedAt + envelopeTtlMs`).
   * - `{ everyone: true }` — one make-public grant (backend rewrites the target to the
   *   everyone-user); the envelope's `expiresAt` is `null`, so it never expires.
   *
   * v1 always passes `mode: "copy"`.
   */
  public async shareProjects(
    projectIds: ProjectId[],
    options: ShareProjectsOptions,
  ): Promise<void> {
    if (projectIds.length === 0) throw new Error("shareProjects: no projects given");

    // Everyone + replace: refresh the existing everyone-share of this project under its stable
    // shareId (so recipients who already decided aren't re-prompted), if one exists. Found
    // automatically by project overlap; falls through to a fresh share when none exists.
    if ("everyone" in options && options.replace) {
      const priorEveryone = (await this.findSupersedableEnvelopes(projectIds)).find(
        (p) => p.everyone,
      );
      if (priorEveryone !== undefined) {
        await this.changeShare(priorEveryone.shareId, { title: options.title });
        return;
      }
    }

    await this.createNewShare(projectIds, options);
  }

  /**
   * Mints a fresh share: snapshots the projects into one new envelope (a fresh shareId),
   * supersedes prior shares of the same project, and grants it — all in one atomic write
   * transaction, so a failed grant rolls the whole thing back and the outbox is left as it was.
   * The everyone-refresh path is the {@link changeShare} branch of {@link shareProjects}; this is
   * the mint-a-new-envelope branch.
   */
  private async createNewShare(
    projectIds: ProjectId[],
    options: ShareProjectsOptions,
  ): Promise<void> {
    const everyone = "everyone" in options;
    const sources: EnvelopeProjectSource[] = await Promise.all(
      projectIds.map(
        async (id): Promise<EnvelopeProjectSource> => ({
          kind: "fresh",
          projectId: id,
          sourceRid: await this.resolveProjectId(id),
        }),
      ),
    );
    const sender = this.currentUserLogin ?? "";
    // Targeted share: sharedAt + ttl. Share-with-everybody: never expires (null).
    const expiresAt = everyone ? null : Date.now() + this.env.ops.envelopeTtlMs;

    // Supersede prior shares of the same project(s) so they never pile up. Resolved before
    // the write tx (ListGrants is a separate RPC). Everyone-share supersedes a prior
    // everyone-share of the same project; a targeted share pulls each named recipient out of
    // any prior share of that project, deleting that share if it ends up with no recipients.
    const priors = await this.findSupersedableEnvelopes(projectIds);

    await this.pl.withWriteTx("MLShareProjects", async (tx) => {
      if (everyone) {
        for (const prior of priors) {
          if (prior.everyone) tx.removeField(field(this.sharingOutboxResourceId, prior.fieldName));
        }
      } else {
        const newRecipients = new Set(options.recipients);
        for (const prior of priors) {
          if (prior.everyone) continue; // a single user can't be pulled from an everyone-grant
          const toRemove = prior.recipients.filter((u) => newRecipients.has(u));
          if (toRemove.length === 0) continue;
          const remaining = prior.recipients.filter((u) => !newRecipients.has(u));
          if (remaining.length === 0) {
            // Nobody left on the old share — drop the whole envelope.
            tx.removeField(field(this.sharingOutboxResourceId, prior.fieldName));
          } else {
            for (const u of toRemove) tx.revokeAccess(prior.rid, u);
          }
        }
      }

      const { envelope } = await buildShareEnvelope(tx, this.sharingOutboxResourceId, sources, {
        mode: options.mode,
        sender,
        title: options.title,
        expiresAt,
      });

      // Grant in the same transaction, atomic with the create.
      await this.grantShareEnvelope(tx, envelope, everyone, everyone ? [] : options.recipients, {
        writable: true,
      });

      await tx.commit();
    });

    await this.sharingOutboxTree.refreshState();
  }

  /**
   * Grants one freshly built envelope inside the transaction that created it: a single make-public
   * grant for an everyone-share (empty/ignored target, ANY_AUTHORISED — the backend rewrites the
   * target to the everyone-user, gated by role + permission ceiling), or one grant per named
   * recipient.
   *
   * `writable` is not a preference. A project pack needs a writable grant because accepting copies
   * the snapshots out of the envelope, and the cross-color attach rule permits that only to a
   * writable grant holder. A template share copies nothing — the document sits in the envelope's
   * own immutable data — so it is granted read-only, and must be: a writable everyone-grant would
   * hand every user on the server write access to the envelope.
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
   * Shares one stored template. The envelope carries the document itself, so there is no project
   * snapshot and no resource for the recipient to copy out — which is why the grant is read-only.
   * The cost of that is the donor's receipt: nobody can write an acceptance onto a read-only
   * envelope, so a template share never reports who accepted it.
   *
   * A template holding a block installed from a folder on this machine is refused rather than sent,
   * with every offending entry named. {@link checkTemplateShareable} answers the same question
   * without attempting the share, so a UI can state it on the template itself.
   *
   * @param id template to share
   * @param options recipients XOR everyone, plus the title recipients see
   */
  public async shareTemplate(
    id: TemplateId,
    options: ShareTemplateOptions,
  ): Promise<ShareTemplateOutcome> {
    const loaded = await this.loadShareableTemplate(id);
    if (!loaded.ok) return { ok: false, problems: loaded.problems };

    const everyone = "everyone" in options;
    const sender = this.currentUserLogin ?? "";
    // Targeted share: sharedAt + ttl. Share-with-everybody: never expires (null).
    const expiresAt = everyone ? null : Date.now() + this.env.ops.envelopeTtlMs;

    let shareId: ShareId | undefined;
    await this.pl.withWriteTx("MLShareTemplate", async (tx) => {
      const { envelope, data } = buildTemplateShareEnvelope(
        tx,
        this.sharingOutboxResourceId,
        loaded.template,
        { sender, title: options.title, expiresAt },
      );
      shareId = data.shareId;
      await this.grantShareEnvelope(tx, envelope, everyone, everyone ? [] : options.recipients, {
        writable: false,
      });
      await tx.commit();
    });

    await this.sharingOutboxTree.refreshState();
    return { ok: true, shareId: shareId! };
  }

  /**
   * Every entry of a stored template that stands in the way of sharing it, empty for a template
   * that can be shared. Reads the template and nothing else, so a UI can state the refusal on the
   * template itself instead of only when the user tries to share it.
   */
  public async checkTemplateShareable(id: TemplateId): Promise<readonly TemplateShareProblem[]> {
    const stored = await this.getTemplateData(id);
    return unshareableTemplateEntries(stored.document);
  }

  /** The document and the label of a template that may be shared, or every entry that stops it.
   *  The label is what the recipient's own list will show, so it travels with the document. */
  private async loadShareableTemplate(
    id: TemplateId,
  ): Promise<
    | { ok: true; template: { document: ProjectTemplateV1; label: string } }
    | { ok: false; problems: readonly TemplateShareProblem[] }
  > {
    const rid = await this.resolveTemplateId(id);
    const template = await this.pl.withReadTx("MLReadTemplateForShare", async (tx) => {
      const rd = await tx.getResourceData(rid, false);
      if (rd.data === undefined) throw new Error(`Template ${id} carries no document.`);
      return {
        document: decodeStoredTemplateData(rd.data).document,
        label: await tx.getKValueJson<string>(rid, TemplateLabelKey),
      };
    });

    const problems = unshareableTemplateEntries(template.document);
    if (problems.length > 0) return { ok: false, problems };
    return { ok: true, template };
  }

  /**
   * Changes a share in place (same {@link ShareId}), in one write transaction: re-snapshots live
   * source projects and carries deleted ones' snapshots forward; applies edited recipients/title;
   * transfers already-decided recipients' accept/reject records (they keep their copy and aren't
   * re-prompted); re-grants; drops the old envelope.
   *
   * `opts.recipients` is the full targeted set (decided users are always kept). `opts.title`
   * replaces the title — omit keeps the current one. `opts.everyone` upgrades targeted ->
   * everyone; the reverse is impossible and ignored.
   *
   * `opts.projectActions` is a per-source-project decision, keyed by projectId: `update`
   * re-snapshots the live source (falls back to carry if the source is gone), `keep` carries the
   * existing snapshot (and its timestamp), `remove` drops the project from the pack. A project not
   * in the map defaults to `keep`. Omit the whole map for the legacy auto behavior (live sources
   * updated, gone ones kept) — the everyone-refresh path relies on that.
   *
   * `opts.templateId` is required for, and only used by, a share that carries a template: a stored
   * template is immutable, so an improved one is a different template and the share cannot re-read
   * the one it started from — the caller names the new target. Every other option means the same
   * thing for both kinds of share. Sharing the named template must be permitted (see
   * {@link checkTemplateShareable}) or this throws.
   */
  public async changeShare(
    shareId: ShareId,
    opts: {
      recipients?: string[];
      everyone?: boolean;
      title?: string;
      projectActions?: Record<ProjectId, ProjectChangeAction>;
      templateId?: TemplateId;
    } = {},
  ): Promise<void> {
    // Read outside the write tx: it is two round-trips of its own, and the refusal it can produce
    // must be raised before anything is torn down.
    const target =
      opts.templateId === undefined ? undefined : await this.loadShareableTemplate(opts.templateId);
    if (target !== undefined && !target.ok)
      throw new Error(
        `changeShare: template ${opts.templateId} cannot be shared: ${describeShareProblems(target.problems)}`,
      );

    await this.pl.withWriteTx("MLChangeShare", async (tx) => {
      const old = await this.resolveOutboxEnvelope(tx, shareId);
      if (old === undefined)
        throw new Error(`changeShare: no live share with id ${shareId} in the outbox.`);

      const self = this.currentUserLogin ?? "";
      const grants = await tx.listGrants(old.rid);
      // A targeted share may be upgraded to everyone; an everyone-share can't be narrowed back.
      const everyone = grants.some((g) => isEveryoneUserLogin(g.user)) || opts.everyone === true;
      const priorRecipients = grants
        .filter((g) => !isEveryoneUserLogin(g.user) && g.user !== self)
        .map((g) => g.user);

      if (old.data.payload.kind === "template") {
        if (target === undefined)
          throw new Error(
            `changeShare: share ${shareId} carries a template, so it needs an explicit target ` +
              "template — a stored template never changes, so an improved one is a different template.",
          );
        const recipients = everyone ? [] : (opts.recipients ?? priorRecipients);

        // Same shareId, same outbox field name — detach the old field before rebuilding, or they collide.
        tx.removeField(field(this.sharingOutboxResourceId, old.fieldName));
        const { envelope } = buildTemplateShareEnvelope(
          tx,
          this.sharingOutboxResourceId,
          target.template,
          {
            sender: self,
            title: opts.title === undefined ? old.data.title : opts.title.trim(),
            expiresAt: everyone ? null : Date.now() + this.env.ops.envelopeTtlMs,
            shareId, // SAME shareId — the essence of change
          },
        );

        // Nothing to transfer: a read-only grant cannot write an acceptance, so a template share
        // never accumulated one.
        await this.grantShareEnvelope(tx, envelope, everyone, recipients, { writable: false });
        await tx.commit();
        return;
      }

      // Read the old envelope's project snapshots (uuid -> rid) and accept/reject records.
      const oldRd = await tx.getResourceData(old.rid, true);
      const snapshotByUuid = new Map<string, SignedResourceId>();
      const acceptances: { login: string; acc: EnvelopeAcceptance }[] = [];
      for (const f of oldRd.fields) {
        if (isNullSignedResourceId(f.value)) continue;
        if (isEnvelopeProjectField(f.name)) {
          snapshotByUuid.set(envelopeProjectFieldUuid(f.name), f.value);
        } else if (isAcceptanceField(f.name)) {
          const raw = (await tx.getResourceData(f.value, false)).data;
          if (raw === undefined) continue;
          acceptances.push({
            login: acceptanceFieldLogin(f.name),
            acc: cachedDeserialize(raw) as EnvelopeAcceptance,
          });
        }
      }
      const decidedLogins = acceptances.map((a) => a.login);

      // Everyone-shares ignore recipients; targeted shares keep decided users plus the edited set.
      const recipients = everyone
        ? []
        : Array.from(new Set([...(opts.recipients ?? priorRecipients), ...decidedLogins]));

      // Live source projects by persistable id — these get a fresh snapshot.
      const liveProjects = new Map<string, SignedResourceId>();
      const projList = await tx.getResourceData(this.projectListResourceId, true);
      for (const f of projList.fields) {
        if (isNullSignedResourceId(f.value)) continue;
        liveProjects.set(resourceIdToString(f.value), f.value);
      }

      // Per project (keyed by field uuid), apply the caller's decision (default `keep`); with no
      // projectActions map, fall back to the legacy auto behavior: update a live source, keep a gone one.
      const actions = opts.projectActions;
      const sources: EnvelopeProjectSource[] = [];
      const oldProjects = envelopeProjectMap(old.data);
      for (const uuid of Object.keys(oldProjects) as ProjectFieldUuid[]) {
        const { label, source, updatedAt } = oldProjects[uuid];
        const liveRid = liveProjects.get(source);

        const action = actions
          ? (actions[source] ?? "keep")
          : liveRid !== undefined
            ? "update"
            : "keep";
        if (action === "remove") continue;

        if (action === "update" && liveRid !== undefined) {
          sources.push({ kind: "fresh", projectId: source, sourceRid: liveRid });
        } else {
          // keep, or an "update" whose source vanished before commit (deleted meanwhile, e.g. from
          // another client): carry the prior snapshot. Liveness is read inside this write tx — race-safe.
          const snapshotRid = snapshotByUuid.get(uuid);
          if (snapshotRid !== undefined)
            sources.push({ kind: "carry", projectId: source, label, snapshotRid, updatedAt });
        }
      }

      // Omit (undefined) keeps the current title; a provided value replaces it.
      const title = opts.title === undefined ? old.data.title : opts.title.trim();
      const expiresAt = everyone ? null : Date.now() + this.env.ops.envelopeTtlMs;

      // Same shareId, same outbox field name — detach the old field before rebuilding, or they collide.
      tx.removeField(field(this.sharingOutboxResourceId, old.fieldName));

      const { envelope } = await buildShareEnvelope(tx, this.sharingOutboxResourceId, sources, {
        mode: old.data.mode,
        sender: self,
        title,
        expiresAt,
        shareId, // SAME shareId — the essence of change
      });

      // Transfer the decided users' records onto the new envelope (donor-written copies).
      for (const { login, acc } of acceptances) {
        if (!everyone && !recipients.includes(login)) continue;
        writeEnvelopeAcceptance(tx, envelope, login, acc.action, acc.timestamp);
      }

      await this.grantShareEnvelope(tx, envelope, everyone, recipients, { writable: true });

      await tx.commit();
    });

    await this.sharingOutboxTree.refreshState();
  }

  /**
   * Finds the donor's own outgoing envelopes built from any of the given source projects —
   * the supersede candidates for a fresh share of the same project(s). Reads each envelope's
   * recipient set via `ListGrants` so the caller can pull individual recipients or detect an
   * everyone-share.
   */
  private async findSupersedableEnvelopes(projectIds: ProjectId[]): Promise<
    {
      fieldName: string;
      rid: SignedResourceId;
      shareId: ShareId;
      everyone: boolean;
      recipients: string[];
    }[]
  > {
    const wanted = new Set(projectIds);

    const matched = await this.pl.withReadTx("MLFindSupersede", async (tx) => {
      const outbox = await tx.getResourceData(this.sharingOutboxResourceId, true);
      const out: { fieldName: string; rid: SignedResourceId; shareId: ShareId }[] = [];
      for (const f of outbox.fields) {
        if (isNullSignedResourceId(f.value)) continue;
        const rd = await tx.getResourceData(f.value, false);
        if (rd.data === undefined) continue;
        const data = decodeEnvelopeData(rd.data);
        if (data === undefined) continue;
        if (Object.values(envelopeProjectMap(data)).some((p) => wanted.has(p.source)))
          out.push({ fieldName: f.name, rid: f.value, shareId: data.shareId });
      }
      return out;
    });

    return await Promise.all(
      matched.map(async ({ fieldName, rid, shareId }) => {
        const grants = await this.pl.userResources.listGrants(rid);
        return {
          fieldName,
          rid,
          shareId,
          everyone: grants.some((g) => isEveryoneUserLogin(g.user)),
          recipients: grants.filter((g) => !isEveryoneUserLogin(g.user)).map((g) => g.user),
        };
      }),
    );
  }

  /**
   * Revokes and deletes an outgoing share for all recipients: detaches and deletes the envelope, and
   * its grants are revoked along with it. Already-accepted copies are unaffected (ref-counting keeps
   * the adopted resources alive). Idempotent — revoking a share that is already gone is a no-op.
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
   * feeds {@link pendingShares}. This is the single discovery mechanism: there is no separate
   * `ListUserResources` re-stream on every accept/reject. `refreshState()` is awaited first so a
   * just-granted envelope is observed (the tree's discovery poll may otherwise lag a freshly
   * landed grant). The tree is gRPC-only, so this is empty on a REST-connected client.
   */
  private async resolveLiveEnvelopes(): Promise<Map<ShareId, LiveEnvelope>> {
    await this.pendingSharesTree.refreshState();
    const live = (await this.liveEnvelopes.getValue()) ?? [];
    // Dedup by logical shareId (last writer wins — at most one live envelope per shareId).
    const map = new Map<ShareId, LiveEnvelope>();
    for (const e of live) map.set(e.data.shareId, e);
    return map;
  }

  /**
   * Accepts one or more pending shares. What accepting does depends on what the share carries: a
   * pack of projects is duplicated into this user's project list, while a template is added to this
   * user's own template list and builds nothing — the recipient decides later whether to apply it.
   * Either way the decision is recorded per share, and a read-write share also gets the
   * donor-visible acceptance written onto its envelope. Per-share failures (e.g. an expiry race)
   * are collected, not short-circuited — the rest still get accepted. Accept-all = pass every
   * current pending shareId.
   *
   * `rename` resolves label collisions (same callback contract as {@link duplicateProject}), but
   * the source lives in the envelope tree, so accept calls the low-level mutator directly. It does
   * not apply to a template share, whose label is not required to be unique.
   */
  public async acceptShare(
    shareIds: ShareId[],
    rename?: (previousLabel: string, existingLabels: string[]) => string,
  ): Promise<{
    accepted: ProjectId[];
    acceptedTemplates: TemplateId[];
    failed: { shareId: ShareId; error: string }[];
  }> {
    const live = await this.resolveLiveEnvelopes();
    const login = this.currentUserLogin;

    const accepted: ProjectId[] = [];
    const acceptedTemplates: TemplateId[] = [];
    const failed: { shareId: ShareId; error: string }[] = [];

    for (const shareId of shareIds) {
      const envelope = live.get(shareId);
      if (envelope === undefined) {
        failed.push({ shareId, error: "Share is no longer available." });
        continue;
      }
      try {
        const now = Date.now();
        const payload = envelope.data.payload;

        if (payload.kind === "template") {
          const rid = await this.pl.withWriteTx("MLAcceptTemplateShare", async (tx) => {
            // The template lands on this user's own shelf, keeping who sent it as its provenance.
            const tpl = createTemplate(tx, this.templateListResourceId, payload.label, {
              schemaVersion: 1,
              document: payload.document,
              sender: payload.from,
            });

            writeSharingDecision(tx, this.sharingStateResourceId, shareId, {
              decision: "accepted",
              timestamp: now,
              envelopeSharedAt: envelope.data.sharedAt,
              acceptedProjects: [], // a template share creates no project
            });

            // No acceptance/{login} on the envelope: the grant is read-only, so the write would be
            // refused by the backend, and the donor deliberately gave up that receipt.
            await tx.commit();
            return await tpl.globalId;
          });

          const templateId = resourceIdToString(rid) as TemplateId;
          this.templateIdCache.set(templateId, rid);
          acceptedTemplates.push(templateId);
          continue;
        }

        const createdRids = await this.pl.withWriteTx("MLAcceptShare", async (tx) => {
          const created = await copyEnvelopeProjectsIntoList(
            tx,
            envelope.rid,
            this.projectListResourceId,
            rename,
          );

          // Record the decision on the acceptor's own SharingState, keyed on shareId.
          writeSharingDecision(tx, this.sharingStateResourceId, shareId, {
            decision: "accepted",
            timestamp: now,
            envelopeSharedAt: envelope.data.sharedAt,
            acceptedProjects: resourceIdsToStrings(created),
          });

          // Read-write share: write the donor-visible acceptance onto the envelope.
          if (login !== null && envelope.data.mode !== "read-only")
            writeEnvelopeAcceptance(tx, envelope.rid, login, "accepted", now);

          await tx.commit();
          return created;
        });
        for (const rid of createdRids) {
          const projectId = resourceIdToString(rid) as ProjectId;
          this.projectIdCache.set(projectId, rid);
          accepted.push(projectId);
        }
      } catch (e) {
        failed.push({ shareId, error: e instanceof Error ? e.message : String(e) });
      }
    }

    await Promise.all([
      this.projectListTree.refreshState(),
      this.templateListTree.refreshState(),
      this.sharingStateTree.refreshState(),
    ]);
    return { accepted, acceptedTemplates, failed };
  }

  /** Records rejection of a pending share; it never surfaces again. */
  public async rejectShare(shareId: ShareId): Promise<void> {
    const live = await this.resolveLiveEnvelopes();
    const envelope = live.get(shareId);
    const login = this.currentUserLogin;
    const now = Date.now();

    await this.pl.withWriteTx("MLRejectShare", async (tx) => {
      writeSharingDecision(tx, this.sharingStateResourceId, shareId, {
        decision: "rejected",
        timestamp: now,
        envelopeSharedAt: envelope?.data.sharedAt ?? now,
        acceptedProjects: [],
      });

      // Read-write share: write the donor-visible rejection onto the envelope (if still live).
      if (envelope !== undefined && login !== null && envelope.data.mode !== "read-only")
        writeEnvelopeAcceptance(tx, envelope.rid, login, "rejected", now);

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
      this.sharingOutboxTree.terminate(),
      this.sharingStateTree.terminate(),
      this.pendingSharesTree.terminate(),
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

    const { projects, templates, sharingOutbox, sharingState } = await pl.withWriteTx(
      "MLInitialization",
      async (tx) => {
        // Lazily create each clientRoot-attached singleton resource. Returns the existing
        // resource id if the field is already populated, otherwise creates + locks + sets it.
        const lazyInit = async (
          fieldName: string,
          type: { name: string; version: string },
        ): Promise<{ ref?: ResourceRef; existing?: SignedResourceId }> => {
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

        await tx.commit();

        return {
          projects: projectsR.existing ?? (await projectsR.ref!.globalId),
          templates: templatesR.existing ?? (await templatesR.ref!.globalId),
          sharingState: stateR.existing ?? (await stateR.ref!.globalId),
          sharingOutbox: outboxR.existing ?? (await outboxR.ref!.globalId),
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

    // Project sharing trees and reactive views.
    const outgoingTC = await createOutgoingShares(pl, sharingOutbox, env);
    const sharingStateTree = await createSharingStateTree(pl, sharingState, env);
    const pendingSharesTree = await createPendingSharesTree(pl, env);
    const pendingShares = createPendingSharesComputable(
      pendingSharesTree,
      sharingStateTree,
      pl.userResources.authUser,
    );
    const liveEnvelopes = createLiveEnvelopesComputable(pendingSharesTree);

    return new MiddleLayer(
      env,
      driverKit,
      driverKit.signer,
      projects,
      templates,
      sharingOutbox,
      sharingState,
      openedProjects,
      projectListTC.tree,
      templateListTC.tree,
      outgoingTC.tree,
      sharingStateTree,
      pendingSharesTree,
      v2RegistryProvider,
      projectListTC.computable,
      templateListTC.computable,
      outgoingTC.computable,
      pendingShares,
      liveEnvelopes,
    );
  }
}

//
// Internals
//

/** Refusal reasons as one line, each naming the entry it belongs to, so a throw that escapes to a
 *  log still says which block stands in the way. */
function describeShareProblems(problems: readonly TemplateShareProblem[]): string {
  return problems.map((p) => `${p.entryId}: ${p.error}`).join("; ");
}
