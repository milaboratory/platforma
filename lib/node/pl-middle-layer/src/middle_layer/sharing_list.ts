import type { PruningFunction } from "@milaboratories/pl-tree";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import type { Filter, PlClient, SignedResourceId } from "@milaboratories/pl-client";
import {
  EveryoneUser,
  resourceIdToString,
  resourceType,
  resourceTypesEqual,
  treeFilter,
} from "@milaboratories/pl-client";
import { Computable } from "@milaboratories/computable";
import type { MiddleLayerEnvironment } from "./middle_layer";
import type {
  EnvelopeAcceptance,
  EnvelopeData,
  EnvelopeMode,
  ShareId,
} from "../model/sharing_model";
import {
  asShareId,
  SharedEnvelopeResourceType,
  SharingOutboxResourceType,
  SharingStateResourceType,
} from "../model/sharing_model";

const AcceptanceFieldPrefix = "acceptance/";

/** Donor-facing view of one outgoing share. */
export interface OutgoingShare {
  shareId: ShareId; // stable logical identity of the share, preserved across replaces
  sharedAt: number; // this instance's creation time (ms epoch)
  expiresAt?: number; // EnvelopeData.expiresAt; null maps to undefined = never expires
  mode: EnvelopeMode;
  message?: string;
  projectLabels: string[]; // label values from EnvelopeData.projectLabels (values only)
  /** Full recipient logins, from `ListGrants` on the envelope; `["*"]` for everyone-shares. */
  recipients: string[];
  /** Per recipient who has responded: their decision and when, from acceptance/{login}. */
  responses: Record<string, { action: "accepted" | "rejected"; timestamp: number }>;
}

/** Acceptor-facing view of one pending share. */
export interface PendingShare {
  shareId: ShareId;
  sender: string; // EnvelopeData.sender, display only
  message?: string;
  mode: EnvelopeMode; // v1 renders only "copy" entries
  projectLabels: string[]; // label values from EnvelopeData.projectLabels (values only)
  grantedAt: number;
}

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

/** Intermediate of an outgoing share before its full recipient list is fetched: everything the
 *  tree carries synchronously, plus the envelope's signed id for the async `ListGrants` enrich. */
type OutgoingShareDraft = Omit<OutgoingShare, "recipients"> & { envelopeRid: SignedResourceId };

/**
 * Reactive view of the donor's own outbox. Reads each live envelope's immutable
 * {@link EnvelopeData} plus the per-recipient `acceptance/{login}` records from the tree, then
 * enriches each share's full recipient list via `ListGrants` on the envelope (`["*"]` for an
 * everyone-share). `ListGrants` is gated backend-side to the envelope owner (the donor), which is
 * exactly who reads this view.
 *
 * API-level only in M1 (no UI).
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

        const data = envelope.getDataAsJson<EnvelopeData>();
        if (data === undefined) continue;

        const responses: OutgoingShare["responses"] = {};
        for (const f of envelope.listDynamicFields()) {
          if (!f.startsWith(AcceptanceFieldPrefix)) continue;
          const login = f.slice(AcceptanceFieldPrefix.length);
          const acc = envelope.traverse(f);
          const accData = acc?.getDataAsJson<EnvelopeAcceptance>();
          if (accData === undefined) continue;
          responses[login] = { action: accData.action, timestamp: accData.timestamp };
        }

        drafts.push({
          shareId: data.shareId,
          sharedAt: data.sharedAt,
          ...(data.expiresAt !== null ? { expiresAt: data.expiresAt } : {}),
          mode: data.mode,
          ...(data.message !== undefined ? { message: data.message } : {}),
          projectLabels: Object.values(data.projectLabels),
          responses,
          envelopeRid: envelope.id,
        });
      }
      drafts.sort((a, b) => b.sharedAt - a.sharedAt);
      return drafts;
    },
    {
      // Enrich the full recipient list per envelope via ListGrants (async). An everyone-grant
      // surfaces with the EveryoneUser sentinel, mapped to "*". The donor's own grant on their
      // envelope is dropped — it's their own share, showing their login as a "recipient" is noise.
      postprocessValue: async (
        drafts: OutgoingShareDraft[] | undefined,
      ): Promise<OutgoingShare[] | undefined> => {
        if (drafts === undefined) return undefined;
        const self = pl.userResources.authUser;
        return await Promise.all(
          drafts.map(async ({ envelopeRid, ...share }): Promise<OutgoingShare> => {
            const grants = await pl.userResources.listGrants(envelopeRid);
            const everyone = grants.some((g) => g.user === EveryoneUser);
            const recipients = everyone
              ? ["*"]
              : grants.map((g) => g.user).filter((u) => u !== self);
            return { ...share, recipients };
          }),
        );
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

const DecisionFieldPrefix = "decision/";

const SharedEnvelopePruningFunction: PruningFunction = (resource) => {
  if (!resourceTypesEqual(resource.type, SharedEnvelopeResourceType)) return [];
  return resource.fields;
};

// Discovery only needs each envelope's immutable EnvelopeData (basic resource data); it must NOT
// descend into the project snapshots. Following fields only FROM the envelope stops the walk at
// the UserProject snapshots (their fields are never followed).
const PendingSharesFieldFilter: Filter = treeFilter.resourceTypeEq(SharedEnvelopeResourceType.name);

/**
 * Creates the acceptor's shared-resource discovery tree (a `{kind:'shared'}` seed over
 * {@link SharedEnvelopeResourceType}) plus the {@link PendingShare} computable over it.
 *
 * An envelope surfaces only when its shareId has NO decision/{shareId} on SharingState —
 * the dedup is applied by the caller, which holds the SharingState tree.
 */
export async function createPendingSharesTree(
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
      fieldFilter: PendingSharesFieldFilter,
    },
    env.logger,
  );
}

/** A live envelope discovered in the acceptor's shared-resource tree: its signed resource id and
 *  decoded {@link EnvelopeData}. The accept/reject flow keys these by `data.shareId`. */
export type LiveEnvelope = { rid: SignedResourceId; data: EnvelopeData };

/**
 * Builds a Computable yielding the acceptor's currently-live envelopes, read from the
 * shared-resource discovery tree the ML already maintains — the single discovery mechanism.
 * Accept/reject `.getValue()` this instead of re-streaming `ListUserResources`, so there is no
 * second discovery path. The envelope's signed `rid` (from the tree node) is what the write tx
 * needs; `copyEnvelopeProjectsIntoList` reads the project snapshots itself inside the tx.
 *
 * Returns `undefined` while the tree is still empty/unresolved (mirrors the other tree-backed
 * computables here). Yields a flat list; the caller dedups by `shareId` — at most one live
 * envelope per shareId is expected (the donor keeps one), and a replace tears the old one down.
 */
export function createLiveEnvelopesComputable(
  sharedTree: SynchronizedTreeState,
): Computable<LiveEnvelope[] | undefined> {
  return Computable.make((ctx) => {
    const roots = ctx.accessor(sharedTree.rootsEntry()).nodes();
    const result: LiveEnvelope[] = [];
    for (const envelope of roots) {
      if (envelope === undefined) continue;
      if (!resourceTypesEqual(envelope.resourceType, SharedEnvelopeResourceType)) continue;
      const data = envelope.getDataAsJson<EnvelopeData>();
      if (data === undefined) continue;
      result.push({ rid: envelope.id, data });
    }
    return result;
  });
}

/**
 * Builds the {@link PendingShare} computable over the shared-resource discovery tree, filtered
 * against the set of already-handled shareIds (those with a decision/{shareId} in the acceptor's
 * SharingState). Both trees feed one Computable so it recomputes when either changes.
 *
 * `currentUserLogin` (when known) suppresses the user's own shares: a share-with-everybody grants
 * the everyone-user, so the donor discovers their own envelope as a pending share. There is no
 * scenario where a user accepts their own share, so they are dropped from the pending view.
 */
export function createPendingSharesComputable(
  sharedTree: SynchronizedTreeState,
  sharingStateTree: SynchronizedTreeState,
  currentUserLogin: string | null,
): Computable<PendingShare[] | undefined> {
  return Computable.make((ctx) => {
    const roots = ctx.accessor(sharedTree.rootsEntry()).nodes();

    // Set of shareIds already handled (accepted or rejected) — dedup discovery on the logical share.
    const stateNode = ctx.accessor(sharingStateTree.entry()).node();
    const handled = new Set<ShareId>();
    if (stateNode !== undefined)
      for (const f of stateNode.listDynamicFields())
        if (f.startsWith(DecisionFieldPrefix))
          handled.add(asShareId(f.slice(DecisionFieldPrefix.length)));

    const result: PendingShare[] = [];
    for (const envelope of roots) {
      if (envelope === undefined) continue;
      if (!resourceTypesEqual(envelope.resourceType, SharedEnvelopeResourceType)) continue;
      const data = envelope.getDataAsJson<EnvelopeData>();
      if (data === undefined) continue;
      if (handled.has(data.shareId)) continue; // already accepted or rejected
      if (currentUserLogin !== null && data.sender === currentUserLogin) continue; // own share
      if (data.expiresAt !== null && data.expiresAt <= Date.now()) continue;

      result.push({
        shareId: data.shareId,
        sender: data.sender,
        ...(data.message !== undefined ? { message: data.message } : {}),
        mode: data.mode,
        projectLabels: Object.values(data.projectLabels),
        grantedAt: data.sharedAt,
      });
    }
    result.sort((a, b) => b.grantedAt - a.grantedAt);
    return result;
  });
}

const SharingStatePruningFunction: PruningFunction = (resource) => {
  if (!resourceTypesEqual(resource.type, SharingStateResourceType)) return [];
  return resource.fields;
};

// decision/{shareId} values are leaf JSON resources; follow fields only from SharingState.
const SharingStateFieldFilter: Filter = treeFilter.resourceTypeEq(SharingStateResourceType.name);

/** Creates the acceptor's SharingState synchronized tree (single explicit root). */
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

/** Maps an envelope resource id (signed) to its string form, for failure reporting. */
export function envelopeIdString(rid: SignedResourceId): string {
  return resourceIdToString(rid);
}
