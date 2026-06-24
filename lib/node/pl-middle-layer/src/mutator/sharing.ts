import type { PlTransaction, ResourceRef, SignedResourceId } from "@milaboratories/pl-client";
import { field, isNotNullSignedResourceId, resourceIdToString } from "@milaboratories/pl-client";
import { randomUUID } from "node:crypto";
import type { ProjectMeta } from "@milaboratories/pl-model-middle-layer";
import { ProjectMetaKey } from "../model/project_model";
import { duplicateProject } from "./project";
import type {
  EnvelopeData,
  EnvelopeAcceptance,
  EnvelopeMode,
  SharingDecision,
} from "../model/sharing_model";
import { SharedEnvelopeResourceType, acceptanceField, decisionField } from "../model/sharing_model";

/** Field name carrying a project snapshot inside a {@link SharedEnvelopeResourceType}. */
export const envelopeProjectField = (uuid: string) => `project/${uuid}`;
const EnvelopeProjectFieldPrefix = "project/";

/** True for an envelope field that carries a project snapshot. */
export function isEnvelopeProjectField(name: string): boolean {
  return name.startsWith(EnvelopeProjectFieldPrefix);
}

//
// Donor side
//

/**
 * Builds one {@link SharedEnvelopeResourceType} on the donor side inside the given write
 * transaction: snapshots each source project by reference, seals the envelope with its
 * immutable {@link EnvelopeData}, and attaches the envelope under `{shareId}` on the donor's
 * outbox. The caller is responsible for issuing the per-recipient grants and committing the
 * transaction — keeping create + grant atomic.
 *
 * @returns the new envelope resource and the generated `EnvelopeData`.
 */
export async function buildShareEnvelope(
  tx: PlTransaction,
  outboxRid: SignedResourceId,
  sourceProjectRids: SignedResourceId[],
  params: {
    mode: EnvelopeMode;
    sender: string;
    message?: string;
    /** ms epoch; sharedAt + ttl for a targeted share, null for share-with-everybody. */
    expiresAt: number | null;
    /** Existing shareId for a replace; a fresh UUID is minted when omitted. */
    shareId?: string;
    sharedAt?: number;
  },
): Promise<{ envelope: ResourceRef; data: EnvelopeData }> {
  const shareId = params.shareId ?? randomUUID();
  const sharedAt = params.sharedAt ?? Date.now();

  // Snapshot each source project by reference and collect labels for the pending-share UI.
  const projectLabels: Record<string, string> = {};
  const snapshots: { uuid: string; ref: ResourceRef }[] = [];
  for (const sourceRid of sourceProjectRids) {
    const meta = await tx.getKValueJson<ProjectMeta>(sourceRid, ProjectMetaKey);
    const uuid = randomUUID();
    const ref = await duplicateProject(tx, sourceRid, { label: meta.label });
    projectLabels[uuid] = meta.label;
    snapshots.push({ uuid, ref });
  }

  const data: EnvelopeData = {
    schemaVersion: 1,
    shareId,
    sharedAt,
    expiresAt: params.expiresAt,
    mode: params.mode,
    sender: params.sender,
    ...(params.message !== undefined ? { message: params.message } : {}),
    projectLabels,
  };

  // Immutable data set once at creation, never altered.
  const envelope = tx.createEphemeral(SharedEnvelopeResourceType, JSON.stringify(data));

  // Attach the project snapshots as Input fields, then seal the input set one-way.
  for (const { uuid, ref } of snapshots) {
    tx.createField(field(envelope, envelopeProjectField(uuid)), "Input", ref);
  }
  tx.lockInputs(envelope);

  // Attach to the outbox under {shareId} in the same transaction so the held-resource rule
  // keeps the ephemeral envelope alive.
  tx.createField(field(outboxRid, shareId), "Dynamic", envelope);

  return { envelope, data };
}

/**
 * Records the acceptor's response onto the envelope as a dynamic `acceptance/{login}` field
 * (read-write shares only). The acceptor's writable envelope grant is what permits this write.
 */
export function writeEnvelopeAcceptance(
  tx: PlTransaction,
  envelopeRid: SignedResourceId,
  login: string,
  action: EnvelopeAcceptance["action"],
  timestamp: number,
): void {
  const acceptance: EnvelopeAcceptance = { action, timestamp };
  const value = tx.createJsonValue(acceptance);
  tx.createField(field(envelopeRid, acceptanceField(login)), "Dynamic", value);
}

//
// Acceptor side
//

/**
 * Records the acceptor's decision for a handled share on the acceptor's SharingState as a
 * dynamic `decision/{shareId}` field. Keyed on the logical shareId so discovery dedups on the
 * share, not on the envelope instance.
 */
export function writeSharingDecision(
  tx: PlTransaction,
  stateRid: SignedResourceId,
  shareId: string,
  decision: SharingDecision,
): void {
  const value = tx.createJsonValue(decision);
  tx.createField(field(stateRid, decisionField(shareId)), "Dynamic", value);
}

/**
 * Adopts every project snapshot inside an envelope into the acceptor's project list — the
 * cross-color attach the delivered backend changes legalize. Mirrors
 * {@link duplicateProject}'s `rename` contract, but resolves the source against the envelope
 * tree (not the acceptor's own list), so the wrapper cannot be reused.
 *
 * @returns ids of the projects created in the acceptor's list.
 */
export async function adoptEnvelopeProjects(
  tx: PlTransaction,
  envelopeRid: SignedResourceId,
  projectListRid: SignedResourceId,
  rename?: (previousLabel: string, existingLabels: string[]) => string,
): Promise<SignedResourceId[]> {
  // Read the acceptor's existing project labels once (own color, no relaxation).
  const projectListData = await tx.getResourceData(projectListRid, true);
  const existingRids = projectListData.fields.map((f) => f.value).filter(isNotNullSignedResourceId);
  const existingLabels = (
    await Promise.all(existingRids.map((rid) => tx.getKValueJson<ProjectMeta>(rid, ProjectMetaKey)))
  ).map((m) => m.label);

  // Enumerate the envelope's project/{uuid} input field values (signed envelope-colored ids).
  const envelopeData = await tx.getResourceData(envelopeRid, true);
  const sourceRids = envelopeData.fields
    .filter((f) => isEnvelopeProjectField(f.name))
    .map((f) => f.value)
    .filter(isNotNullSignedResourceId);

  const created: SignedResourceId[] = [];
  for (const sourceRid of sourceRids) {
    const sourceMeta = await tx.getKValueJson<ProjectMeta>(sourceRid, ProjectMetaKey);
    const newLabel = rename ? rename(sourceMeta.label, existingLabels) : sourceMeta.label;
    existingLabels.push(newLabel);

    // Cross-color attach: a new UserProject in the acceptor's color whose fields point at
    // envelope-colored resources. Fails with PermissionDenied: color mismatch on a backend
    // that lacks crossTreeRefs:v1.
    const newPrj = await duplicateProject(tx, sourceRid, { label: newLabel });
    tx.createField(field(projectListRid, randomUUID()), "Dynamic", newPrj);

    const signedRid = await newPrj.globalId;
    created.push(signedRid);
  }

  return created;
}

/** String-form ids of the projects created by {@link adoptEnvelopeProjects}. */
export function resourceIdsToStrings(ids: SignedResourceId[]): string[] {
  return ids.map((id) => resourceIdToString(id));
}
