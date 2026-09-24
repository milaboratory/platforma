import type { PlTreeNodeAccessor, PruningFunction } from "@milaboratories/pl-tree";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import type { Filter, PlClient, SignedResourceId } from "@milaboratories/pl-client";
import {
  isEveryoneUserLogin,
  resourceType,
  resourceTypesEqual,
  treeFilter,
} from "@milaboratories/pl-client";
import { Computable } from "@milaboratories/computable";
import type { MiddleLayerEnvironment } from "./middle_layer";
import type { ProjectId, TemplateId } from "@milaboratories/pl-model-common";
import type { FolderId } from "@milaboratories/pl-model-middle-layer";
import type {
  EnvelopeData,
  EnvelopeMode,
  EnvelopePayloadKind,
  ShareId,
} from "../model/sharing_model";
import {
  hiddenFieldShareId,
  isHiddenField,
  envelopeFolderRoot,
  envelopeProjectMap,
  normalizeEnvelopeData,
  SharedEnvelopeResourceType,
  SharingOutboxResourceType,
  SharingStateResourceType,
} from "../model/sharing_model";

/** What a folder share carries, as both share lists show it. */
export interface EnvelopeFolderSummary {
  label: string;
  /** Donor's own id of the shared folder. */
  source: FolderId;
  folderCount: number;
  projectCount: number;
  templateCount: number;
}

/** Donor-facing view of one outgoing share. */
export interface OutgoingShare {
  shareId: ShareId; // identity of the share; a share that replaces it gets its own
  sharedAt: number; // this instance's creation time (ms epoch)
  expiresAt?: number; // EnvelopeData.expiresAt; null maps to undefined = never expires
  mode: EnvelopeMode;
  title: string; // display name shown to recipients; defaults to the first project's name
  /** What the share carries — a pack of projects, one template document, or a folder subtree. */
  payloadKind: EnvelopePayloadKind;
  /** One entry per project in the pack. `projectId` is the donor's source project id, which is
   *  what the share dialog matches a project's prior shares on; `updatedAt` is when this
   *  project's snapshot was taken. Empty for any share that is not a pack of projects. */
  projects: { projectId: ProjectId; label: string; updatedAt: number }[];
  /** The shared template, for a template share; absent otherwise. `source` is the donor's own
   *  template id, which is what the share dialog matches a template's prior shares on; a share
   *  made before it was carried has none and matches nothing. */
  template?: { label: string; blockCount: number; source?: TemplateId };
  /** The shared folder, for a folder share; absent otherwise. `label` is the root folder's own
   *  name, `source` the donor's own id for it — what a prior share of the same folder is matched
   *  on — and the counts are of the whole subtree, the root folder itself excluded. */
  folder?: EnvelopeFolderSummary;
  /** What the shared thing says about itself: a template's, a folder's, or the one project's of
   *  a single-project share. Absent for a pack of several, which has no one thing to describe. */
  description?: string;
  /** Full recipient logins, from `ListGrants` on the envelope; `["*"]` for everyone-shares. */
  recipients: string[];
}

/**
 * Recipient-facing view of one share that is open to this user.
 *
 * A share is a shelf, not an invitation: it stays listed for as long as the envelope lives, and
 * the recipient may copy from it any number of times. {@link hidden} is that recipient's own
 * private choice to stop seeing it, and it can be undone.
 */
export interface AvailableShare {
  shareId: ShareId;
  sender: string; // EnvelopeData.sender, display only
  title: string; // display name shown to recipients; defaults to the first project's name
  mode: EnvelopeMode;
  /** What the share carries — projects to copy, a template to add to the recipient's templates,
   *  or a folder subtree to rebuild in the recipient's tree. */
  payloadKind: EnvelopePayloadKind;
  grantedAt: number;
  /** What the shared thing says about itself. See {@link OutgoingShare.description}. */
  description?: string;
  /** The shared folder, for a folder share; absent otherwise. See {@link OutgoingShare.folder}. */
  folder?: EnvelopeFolderSummary;
  /** Whether this recipient has put it out of sight. Hidden shares are listed, not dropped: the
   *  view that shows them is what "show hidden" turns on. */
  hidden: boolean;
}

/** A live envelope discovered in the recipient's shared-resource tree: its signed resource id and
 *  decoded {@link EnvelopeData}. A copy out of a share finds it by `data.shareId`. */
export type LiveEnvelope = { rid: SignedResourceId; data: EnvelopeData };

/**
 * Reactive view of the donor's own outbox. Reads each live envelope's immutable
 * {@link EnvelopeData} from the tree, then enriches each share's full recipient list via
 * `ListGrants` on the envelope (`["*"]` for an everyone-share). `ListGrants` is gated backend-side
 * to the envelope owner (the donor), which is exactly who reads this view.
 */
export function createOutgoingSharesComputable(
  pl: PlClient,
  tree: SynchronizedTreeState,
): Computable<OutgoingShare[] | undefined> {
  return Computable.make(
    (ctx) => {
      const node = ctx.accessor(tree.entry()).node();
      if (node === undefined) return undefined;

      const drafts: OutgoingShareDraft[] = [];
      // Outbox fields are keyed by shareId; each value is a SharedEnvelope.
      for (const fieldName of node.listDynamicFields()) {
        const envelope = node.traverse(fieldName);
        if (envelope === undefined) continue;
        if (!resourceTypesEqual(envelope.resourceType, SharedEnvelopeResourceType)) continue;

        const data = normalizeEnvelopeData(envelope.getDataAsJson<unknown>());
        if (data === undefined) continue; // unknown version or payload kind — not ours to show

        const folder = envelopeFolderSummary(data);
        const description = envelopeDescription(data);
        drafts.push({
          shareId: data.shareId,
          sharedAt: data.sharedAt,
          ...(data.expiresAt !== null ? { expiresAt: data.expiresAt } : {}),
          mode: data.mode,
          title: data.title,
          payloadKind: data.payload.kind,
          projects: envelopeProjects(data),
          ...(data.payload.kind === "template"
            ? {
                template: {
                  label: data.payload.label,
                  blockCount: data.payload.document.blocks.length,
                  ...(data.payload.source === undefined ? {} : { source: data.payload.source }),
                },
              }
            : {}),
          ...(folder === undefined ? {} : { folder }),
          ...(description === undefined ? {} : { description }),
          envelopeRid: envelope.id,
        });
      }
      drafts.sort((a, b) => b.sharedAt - a.sharedAt);
      return drafts;
    },
    {
      // Resolve each share's recipients via listGrants. An everyone-grant maps to "*"; the donor's
      // own grant is dropped. One tx per envelope so a just-revoked rid faults only its own read,
      // which allSettled degrades to []. Recipients aren't cached — a live share's recipient set can
      // change. Transactional listGrants when available, else the standalone gRPC-only RPC.
      postprocessValue: async (
        drafts: OutgoingShareDraft[] | undefined,
      ): Promise<OutgoingShare[] | undefined> => {
        if (drafts === undefined) return undefined;
        const self = pl.userResources.authUser;
        const toRecipients = (grants: { user: string }[]): string[] =>
          grants.some((g) => isEveryoneUserLogin(g.user))
            ? ["*"]
            : grants.map((g) => g.user).filter((u) => u !== self);

        const txGrants = pl.hasCapability("txListGrants:v1");
        const settled = await Promise.allSettled(
          drafts.map((d) =>
            txGrants
              ? pl.withReadTx("ListShareGrant", (tx) => tx.listGrants(d.envelopeRid))
              : pl.userResources.listGrants(d.envelopeRid),
          ),
        );

        return drafts.map(({ envelopeRid: _envelopeRid, ...share }, i): OutgoingShare => {
          const r = settled[i];
          return { ...share, recipients: r.status === "fulfilled" ? toRecipients(r.value) : [] };
        });
      },
    },
  );
}

/**
 * Creates the donor's outbox synchronized tree (single explicit root) plus the
 * {@link OutgoingShare} computable over it.
 */
export async function createOutgoingShares(
  pl: PlClient,
  outboxRid: SignedResourceId,
  env: MiddleLayerEnvironment,
): Promise<{ tree: SynchronizedTreeState; computable: Computable<OutgoingShare[] | undefined> }> {
  const tree = await SynchronizedTreeState.init(
    pl,
    outboxRid,
    {
      ...env.ops.defaultTreeOptions,
      pruning: SharingOutboxPruningFunction,
      fieldFilter: SharingOutboxFieldFilter,
    },
    env.logger,
  );
  return { computable: createOutgoingSharesComputable(pl, tree), tree };
}

/**
 * Creates the recipient's shared-resource discovery tree: a `{kind:'shared'}` seed over
 * {@link SharedEnvelopeResourceType}. {@link createAvailableSharesComputable} and
 * {@link createLiveEnvelopesComputable} both read it.
 */
export async function createAvailableSharesTree(
  pl: PlClient,
  env: MiddleLayerEnvironment,
): Promise<SynchronizedTreeState> {
  return await SynchronizedTreeState.init(
    pl,
    {
      kind: "shared",
      resourceType: resourceType(
        SharedEnvelopeResourceType.name,
        SharedEnvelopeResourceType.version,
      ),
    },
    {
      ...env.ops.defaultTreeOptions,
      pruning: SharedEnvelopePruningFunction,
      fieldFilter: AvailableSharesFieldFilter,
    },
    env.logger,
  );
}

/**
 * Builds a Computable yielding the recipient's currently-live envelopes, read from the
 * shared-resource discovery tree the ML already maintains — the single discovery mechanism.
 * A copy out of a share `.getValue()`s this instead of re-streaming `ListUserResources`, so there
 * is no second discovery path. The envelope's signed `rid` (from the tree node) is what the write
 * tx needs; `copyEnvelopeProjectsIntoList` reads the project snapshots itself inside the tx.
 *
 * Yields a flat list; the caller dedups by `shareId` — at most one live envelope per shareId is
 * expected (the donor keeps one), and a replace tears the old one down.
 */
export function createLiveEnvelopesComputable(
  sharedTree: SynchronizedTreeState,
): Computable<LiveEnvelope[] | undefined> {
  return Computable.make((ctx) => decodedEnvelopes(ctx.accessor(sharedTree.rootsEntry()).nodes()));
}

/**
 * Builds the {@link AvailableShare} computable over the shared-resource discovery tree, marking
 * each entry with whether this user has hidden it (a hiddenField in their own SharingState).
 * Both trees feed one Computable so it recomputes when either changes.
 *
 * `currentUserLogin` (when known) suppresses the user's own shares: a share-with-everybody grants
 * the everyone-user, so the donor discovers their own envelope here. A donor already owns what
 * they shared, so their own envelopes are dropped from this view.
 */
export function createAvailableSharesComputable(
  sharedTree: SynchronizedTreeState,
  sharingStateTree: SynchronizedTreeState,
  currentUserLogin: string | null,
): Computable<AvailableShare[] | undefined> {
  return Computable.make((ctx) => {
    // Shares this user has put out of sight, keyed on the share. A share replaced by a newer one
    // is a new share, so its replacement arrives unhidden.
    const stateNode = ctx.accessor(sharingStateTree.entry()).node();
    const hidden = new Set<ShareId>();
    if (stateNode !== undefined)
      for (const f of stateNode.listDynamicFields())
        if (isHiddenField(f)) hidden.add(hiddenFieldShareId(f));

    const result: AvailableShare[] = [];
    for (const { data } of decodedEnvelopes(ctx.accessor(sharedTree.rootsEntry()).nodes())) {
      if (currentUserLogin !== null && data.sender === currentUserLogin) continue; // own share
      if (data.expiresAt !== null && data.expiresAt <= Date.now()) continue;

      const folder = envelopeFolderSummary(data);
      const description = envelopeDescription(data);
      result.push({
        shareId: data.shareId,
        sender: data.sender,
        title: data.title,
        mode: data.mode,
        payloadKind: data.payload.kind,
        grantedAt: data.sharedAt,
        ...(description === undefined ? {} : { description }),
        ...(folder === undefined ? {} : { folder }),
        hidden: hidden.has(data.shareId),
      });
    }
    result.sort((a, b) => b.grantedAt - a.grantedAt);
    return result;
  });
}

/** Creates the recipient's SharingState synchronized tree (single explicit root). */
export async function createSharingStateTree(
  pl: PlClient,
  stateRid: SignedResourceId,
  env: MiddleLayerEnvironment,
): Promise<SynchronizedTreeState> {
  return await SynchronizedTreeState.init(
    pl,
    stateRid,
    {
      ...env.ops.defaultTreeOptions,
      pruning: SharingStatePruningFunction,
      fieldFilter: SharingStateFieldFilter,
    },
    env.logger,
  );
}

//
// Internals
//

const SharingOutboxPruningFunction: PruningFunction = (resource) => {
  if (
    !resourceTypesEqual(resource.type, SharingOutboxResourceType) &&
    !resourceTypesEqual(resource.type, SharedEnvelopeResourceType)
  )
    return [];
  return resource.fields;
};

// Server-side traversal scope (modern resourceTree path). Pruning is client-side ONLY and does
// NOT stop the backend walk — without a fieldFilter the backend descends through the envelope's
// project/{uuid} snapshots into the whole project graph (StreamManager etc.), whose field-driven
// finality predicate then throws on the pruned-to-[] fields. Following fields only FROM the outbox
// and the envelope stops the walk at the project snapshots (UserProject), which we never traverse.
const SharingOutboxFieldFilter: Filter = treeFilter.or(
  treeFilter.resourceTypeEq(SharingOutboxResourceType.name),
  treeFilter.resourceTypeEq(SharedEnvelopeResourceType.name),
);

const SharedEnvelopePruningFunction: PruningFunction = (resource) => {
  if (!resourceTypesEqual(resource.type, SharedEnvelopeResourceType)) return [];
  return resource.fields;
};

// Discovery only needs each envelope's immutable EnvelopeData (basic resource data); it must NOT
// descend into the project snapshots. Following fields only FROM the envelope stops the walk at
// the UserProject snapshots (their fields are never followed).
const AvailableSharesFieldFilter: Filter = treeFilter.resourceTypeEq(
  SharedEnvelopeResourceType.name,
);

const SharingStatePruningFunction: PruningFunction = (resource) => {
  if (!resourceTypesEqual(resource.type, SharingStateResourceType)) return [];
  return resource.fields;
};

// decision/{shareId} values are leaf JSON resources; follow fields only from SharingState.
const SharingStateFieldFilter: Filter = treeFilter.resourceTypeEq(SharingStateResourceType.name);

/** Intermediate of an outgoing share before its full recipient list is fetched: everything the
 *  tree carries synchronously, plus the envelope's signed id for the async `ListGrants` enrich. */
type OutgoingShareDraft = Omit<OutgoingShare, "recipients"> & { envelopeRid: SignedResourceId };

/**
 * Every envelope among the discovery tree's roots that this build can read, decoded. A root that
 * is not a {@link SharedEnvelopeResourceType}, or whose schemaVersion or payload kind this build
 * does not know, is left out rather than offered: there is nothing useful to do with a share that
 * cannot be read.
 */
function decodedEnvelopes(roots: readonly (PlTreeNodeAccessor | undefined)[]): LiveEnvelope[] {
  const result: LiveEnvelope[] = [];
  for (const envelope of roots) {
    if (envelope === undefined) continue;
    if (!resourceTypesEqual(envelope.resourceType, SharedEnvelopeResourceType)) continue;
    const data = normalizeEnvelopeData(envelope.getDataAsJson<unknown>());
    if (data === undefined) continue;
    result.push({ rid: envelope.id, data });
  }
  return result;
}

/** Per-project view for the donor, from the envelope's `projects` payload; empty for a payload
 *  that carries no project. */
function envelopeProjects(data: EnvelopeData): OutgoingShare["projects"] {
  return Object.values(envelopeProjectMap(data)).map((p) => ({
    projectId: p.source,
    label: p.label,
    updatedAt: p.updatedAt,
  }));
}

/**
 * What a folder share is, in the words both lists show it in: the shared folder's name and how
 * much is inside. `undefined` for any other payload.
 *
 * The root folder is excluded from `folderCount` — it is the thing being described, not something
 * inside it. A folder envelope with no single root is one nothing can be rebuilt from, and it is
 * described as nothing rather than guessed at.
 */
function envelopeFolderSummary(data: EnvelopeData): EnvelopeFolderSummary | undefined {
  if (data.payload.kind !== "folder") return undefined;
  const { folders, projects, templates } = data.payload;
  const root = envelopeFolderRoot(folders);
  if (root === undefined) return undefined;
  return {
    label: folders[root].name,
    source: data.payload.source,
    folderCount: Object.keys(folders).length - 1,
    projectCount: Object.keys(projects).length,
    templateCount: templates.length,
  };
}

/**
 * What the shared thing says about itself: the template's description, the root folder's, or the
 * one project's of a single-project share. `undefined` when it has none, for a pack of several
 * projects, which describes no single thing, and for a folder envelope with no single root.
 */
function envelopeDescription(data: EnvelopeData): string | undefined {
  const payload = data.payload;
  switch (payload.kind) {
    case "template":
      return payload.description;
    case "folder": {
      const root = envelopeFolderRoot(payload.folders);
      return root === undefined ? undefined : payload.folders[root].description;
    }
    case "projects": {
      const projects = Object.values(payload.projects);
      return projects.length === 1 ? projects[0]?.description : undefined;
    }
  }
}
