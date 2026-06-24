import type { PruningFunction } from "@milaboratories/pl-tree";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import type { Filter, PlClient, SignedResourceId } from "@milaboratories/pl-client";
import {
  resourceIdToString,
  resourceType,
  resourceTypesEqual,
  treeFilter,
} from "@milaboratories/pl-client";
import { Computable } from "@milaboratories/computable";
import type { MiddleLayerEnvironment } from "./middle_layer";
import type { EnvelopeAcceptance, EnvelopeData, EnvelopeMode } from "../model/sharing_model";
import {
  SharedEnvelopeResourceType,
  SharingOutboxResourceType,
  SharingStateResourceType,
} from "../model/sharing_model";

const AcceptanceFieldPrefix = "acceptance/";

/** Donor-facing view of one outgoing share. */
export interface OutgoingShare {
  shareId: string; // stable logical identity of the share, preserved across replaces
  sharedAt: number; // this instance's creation time (ms epoch)
  expiresAt?: number; // EnvelopeData.expiresAt; null maps to undefined = never expires
  mode: EnvelopeMode;
  message?: string;
  projectLabels: string[]; // label values from EnvelopeData.projectLabels (values only)
  /** Recipient logins. Currently surfaced from the acceptance records (responders); a full
   * recipient list needs a ListGrants pl-client wrapper (M2). */
  recipients: string[];
  /** Per recipient who has responded: their decision and when, from acceptance/{login}. */
  responses: Record<string, { action: "accepted" | "rejected"; timestamp: number }>;
}

/** Acceptor-facing view of one pending share. */
export interface PendingShare {
  shareId: string;
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

/**
 * Reactive view of the donor's own outbox. Reads each live envelope's immutable
 * {@link EnvelopeData} plus the per-recipient `acceptance/{login}` records.
 *
 * API-level only in M1 (no UI).
 */
export function createOutgoingSharesComputable(
  tree: SynchronizedTreeState,
): Computable<OutgoingShare[] | undefined> {
  return Computable.make((ctx) => {
    const node = ctx.accessor(tree.entry()).node();
    if (node === undefined) return undefined;

    const result: OutgoingShare[] = [];
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

      result.push({
        shareId: data.shareId,
        sharedAt: data.sharedAt,
        ...(data.expiresAt !== null ? { expiresAt: data.expiresAt } : {}),
        mode: data.mode,
        ...(data.message !== undefined ? { message: data.message } : {}),
        projectLabels: Object.values(data.projectLabels),
        recipients: Object.keys(responses),
        responses,
      });
    }
    result.sort((a, b) => b.sharedAt - a.sharedAt);
    return result;
  });
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
  return { computable: createOutgoingSharesComputable(tree), tree };
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

/**
 * Builds the {@link PendingShare} computable over the shared-resource discovery tree, filtered
 * against the set of already-handled shareIds (those with a decision/{shareId} in the acceptor's
 * SharingState). Both trees feed one Computable so it recomputes when either changes.
 */
export function createPendingSharesComputable(
  sharedTree: SynchronizedTreeState,
  sharingStateTree: SynchronizedTreeState,
): Computable<PendingShare[] | undefined> {
  return Computable.make((ctx) => {
    const roots = ctx.accessor(sharedTree.rootsEntry()).nodes();

    // Set of shareIds already handled (accepted or rejected) — dedup discovery on the logical share.
    const stateNode = ctx.accessor(sharingStateTree.entry()).node();
    const handled = new Set<string>();
    if (stateNode !== undefined)
      for (const f of stateNode.listDynamicFields())
        if (f.startsWith(DecisionFieldPrefix)) handled.add(f.slice(DecisionFieldPrefix.length));

    const result: PendingShare[] = [];
    for (const envelope of roots) {
      if (envelope === undefined) continue;
      if (!resourceTypesEqual(envelope.resourceType, SharedEnvelopeResourceType)) continue;
      const data = envelope.getDataAsJson<EnvelopeData>();
      if (data === undefined) continue;
      if (handled.has(data.shareId)) continue; // already accepted or rejected

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
