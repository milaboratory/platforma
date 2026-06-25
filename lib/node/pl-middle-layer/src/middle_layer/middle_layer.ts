import type {
  PlClient,
  PlTransaction,
  SignedResourceId,
  ResourceRef,
  Role,
} from "@milaboratories/pl-client";
import {
  EveryoneUser,
  field,
  GrantType,
  isNotNullSignedResourceId,
  isNullSignedResourceId,
  resourceIdToString,
} from "@milaboratories/pl-client";
import { LRUCache } from "lru-cache";
import { createProjectList, ProjectsField, ProjectsResourceType } from "./project_list";
import { createProject, duplicateProject, withProjectAuthored } from "../mutator/project";
import { ProjectMetaKey } from "../model/project_model";
import type { ProjectId } from "../model/project_model";
import type { SynchronizedTreeState } from "@milaboratories/pl-tree";
import {
  canGrantToEveryone,
  decodeEnvelopeData,
  SharingOutboxField,
  SharingOutboxResourceType,
  SharingStateField,
  SharingStateResourceType,
  type EnvelopeAcceptance,
  type EnvelopeData,
  type ShareId,
  type ShareProjectsOptions,
} from "../model/sharing_model";
import {
  acceptanceLoginFromField,
  buildShareEnvelope,
  copyEnvelopeProjectsIntoList,
  isAcceptanceField,
  resourceIdsToStrings,
  writeEnvelopeAcceptance,
  writeSharingDecision,
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

  private constructor(
    private readonly env: MiddleLayerEnvironment,
    public readonly driverKit: DriverKit,
    public readonly signer: Signer,
    private readonly projectListResourceId: SignedResourceId,
    private readonly sharingOutboxResourceId: SignedResourceId,
    private readonly sharingStateResourceId: SignedResourceId,
    private readonly openedProjectsList: WatchableValue<ProjectId[]>,
    private readonly projectListTree: SynchronizedTreeState,
    private readonly sharingOutboxTree: SynchronizedTreeState,
    private readonly sharingStateTree: SynchronizedTreeState,
    private readonly pendingSharesTree: SynchronizedTreeState,
    public readonly blockRegistryProvider: V2RegistryProvider,
    /** Contains a reactive list of projects along with their meta information. */
    public readonly projectList: ComputableStableDefined<ProjectListEntry[]>,
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
   * additional required capabilities later without a UI change. See
   * `pl-client/src/core/capabilities.ts` / backend `server_capabilities.go`.
   */
  public get sharingSupported(): boolean {
    return this.serverCapabilities.includes("crossTreeRefs:v1");
  }

  /**
   * Role of the authenticated user, from the `GetSessionInfo` RPC surfaced through the
   * pl-client. `null` in no-auth mode (when {@link currentUserLogin} is null).
   */
  public get currentUserRole(): Role | null {
    return this.pl.currentUserRole;
  }

  /**
   * Whether the UI offers share-with-everybody. Computed in the middle layer, mirroring
   * the backend's make-public rule — no role policy lives in the UI:
   *   serverCapabilities.has("publicGrants:v1") && canGrantToEveryone(currentUserRole)
   * Rebinds to a per-user backend capability if the backend later exposes one (the
   * admins-only restriction / the future multitenant permission model). Not a security
   * boundary: a crafted call still hits the backend's role + permission-ceiling gate.
   */
  public get canShareWithEveryone(): boolean {
    return (
      this.serverCapabilities.includes("publicGrants:v1") &&
      canGrantToEveryone(this.currentUserRole)
    );
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
      const newPrj = await duplicateProject(tx, sourceRid, { label: newLabel });

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

    const everyone = "everyone" in options;
    const sourceRids = await Promise.all(projectIds.map((id) => this.resolveProjectId(id)));
    const sender = this.currentUserLogin ?? "";
    // Targeted share: sharedAt + ttl. Share-with-everybody: never expires (null).
    const expiresAt = everyone ? null : Date.now() + this.env.ops.envelopeTtlMs;

    await this.pl.withWriteTx("MLShareProjects", async (tx) => {
      const { envelope } = await buildShareEnvelope(tx, this.sharingOutboxResourceId, sourceRids, {
        mode: options.mode,
        sender,
        message: options.message,
        expiresAt,
      });

      // Grant in the same transaction (writable: the cross-color accept rule demands a writable
      // grant on the envelope). Atomic with the create.
      const envelopeGid = await envelope.globalId;
      if (everyone) {
        // One everyone-grant: empty/ignored target, MAKE_RESOURCE_PUBLIC. The backend rewrites
        // the target to the everyone-user; gated by role + permission ceiling.
        tx.grantAccess(envelopeGid, "", { writable: true }, GrantType.MAKE_RESOURCE_PUBLIC);
      } else {
        for (const recipient of options.recipients) {
          tx.grantAccess(envelopeGid, recipient, { writable: true });
        }
      }

      await tx.commit();
    });

    await this.sharingOutboxTree.refreshState();
  }

  /**
   * Replaces an existing share: mints a new envelope instance under the same `shareId` with the
   * updated project snapshots and a fresh `sharedAt`, copies the recipients' acceptance records
   * forward (so the donor's "who responded" view survives the replace), re-issues the grant (same
   * recipients/mode — an everyone-grant if the original was everyone), and tears down the old
   * envelope — all in one transaction. Recipients who already accepted or rejected this `shareId`
   * are not re-prompted; recipients who have not yet decided see the updated content.
   */
  public async replaceShare(shareId: ShareId, projectIds: ProjectId[]): Promise<void> {
    if (projectIds.length === 0) throw new Error("replaceShare: no projects given");

    const sourceRids = await Promise.all(projectIds.map((id) => this.resolveProjectId(id)));
    const sender = this.currentUserLogin ?? "";

    await this.pl.withWriteTx("MLReplaceShare", async (tx) => {
      // Resolve the existing live envelope for this shareId from the donor's own outbox.
      const old = await this.resolveOutboxEnvelope(tx, shareId);
      if (old === undefined)
        throw new Error(`replaceShare: no live share with id ${shareId} in the outbox.`);

      // The grant target set is preserved: everyone-share keeps the null expiry + everyone-grant.
      const everyone = old.data.expiresAt === null;
      const expiresAt = everyone ? null : Date.now() + this.env.ops.envelopeTtlMs;

      // Mint the new instance under the SAME shareId, with a new sharedAt and updated snapshots.
      const { envelope } = await buildShareEnvelope(tx, this.sharingOutboxResourceId, sourceRids, {
        mode: old.data.mode,
        sender,
        ...(old.data.message !== undefined ? { message: old.data.message } : {}),
        expiresAt,
        shareId,
        sharedAt: Date.now(),
      });

      // The new envelope's signed id, needed both to copy acceptance records onto it and to grant.
      const envelopeGid = await envelope.globalId;

      // Copy the recipients' acceptance records forward onto the new envelope instance.
      const oldData = await tx.getResourceData(old.rid, true);
      for (const f of oldData.fields) {
        if (!isAcceptanceField(f.name)) continue;
        if (isNullSignedResourceId(f.value)) continue;
        const accData = await tx.getResourceData(f.value, false);
        if (accData.data === undefined) continue;
        const acc = JSON.parse(Buffer.from(accData.data).toString("utf-8")) as EnvelopeAcceptance;
        writeEnvelopeAcceptance(
          tx,
          envelopeGid,
          acceptanceLoginFromField(f.name),
          acc.action,
          acc.timestamp,
        );
      }

      // Re-issue the grant — same shape as the original (everyone-grant or per-recipient).
      if (everyone) {
        tx.grantAccess(envelopeGid, "", { writable: true }, GrantType.MAKE_RESOURCE_PUBLIC);
      } else {
        const grants = await this.pl.userResources.listGrants(old.rid);
        for (const g of grants) {
          if (g.user === EveryoneUser) continue;
          tx.grantAccess(envelopeGid, g.user, { writable: g.writable });
        }
      }

      // Remove the old envelope field from the outbox (backend auto-revokes its grants).
      tx.removeField(field(this.sharingOutboxResourceId, old.fieldName));

      await tx.commit();
    });

    await this.sharingOutboxTree.refreshState();
  }

  /**
   * Revokes and deletes an outgoing share for all recipients: detaches and deletes the envelope;
   * the backend auto-revokes all of its grants via `RevokeAllByResource`. Already-accepted copies
   * are unaffected (ref-counting keeps the adopted resources alive).
   */
  public async revokeShare(shareId: ShareId): Promise<void> {
    await this.pl.withWriteTx("MLRevokeShare", async (tx) => {
      const target = await this.resolveOutboxEnvelope(tx, shareId);
      if (target === undefined)
        throw new Error(`revokeShare: no live share with id ${shareId} in the outbox.`);
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
   * Accepts one or more pending shares: duplicates each share's projects into this user's
   * project list, records the decision per share, and (read-write share) writes the donor-visible
   * acceptance onto the envelope. Per-share failures (e.g. an expiry race) are collected, not
   * short-circuited — the rest still get accepted. Accept-all = pass every current pending shareId.
   *
   * `rename` resolves label collisions (same callback contract as {@link duplicateProject}), but
   * the source lives in the envelope tree, so accept calls the low-level mutator directly.
   */
  public async acceptShare(
    shareIds: ShareId[],
    rename?: (previousLabel: string, existingLabels: string[]) => string,
  ): Promise<{ accepted: ProjectId[]; failed: { shareId: ShareId; error: string }[] }> {
    const live = await this.resolveLiveEnvelopes();
    const login = this.currentUserLogin;

    const accepted: ProjectId[] = [];
    const failed: { shareId: ShareId; error: string }[] = [];

    for (const shareId of shareIds) {
      const envelope = live.get(shareId);
      if (envelope === undefined) {
        failed.push({ shareId, error: "Share is no longer available." });
        continue;
      }
      try {
        const now = Date.now();
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

    await Promise.all([this.projectListTree.refreshState(), this.sharingStateTree.refreshState()]);
    return { accepted, failed };
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
    if (this.envelopeCleanupTimer !== undefined) clearInterval(this.envelopeCleanupTimer);
    await Promise.all([...this.openedProjects.values()].map((prj) => prj.destroy()));
    // this.env.quickJs;
    await Promise.all([
      this.projectListTree.terminate(),
      this.sharingOutboxTree.terminate(),
      this.sharingStateTree.terminate(),
      this.pendingSharesTree.terminate(),
    ]);
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

    const { projects, sharingOutbox, sharingState } = await pl.withWriteTx(
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
        const outboxR = await lazyInit(SharingOutboxField, SharingOutboxResourceType);
        const stateR = await lazyInit(SharingStateField, SharingStateResourceType);

        await tx.commit();

        return {
          projects: projectsR.existing ?? (await projectsR.ref!.globalId),
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
      sharingOutbox,
      sharingState,
      openedProjects,
      projectListTC.tree,
      outgoingTC.tree,
      sharingStateTree,
      pendingSharesTree,
      v2RegistryProvider,
      projectListTC.computable,
      outgoingTC.computable,
      pendingShares,
      liveEnvelopes,
    );
  }
}
