import type { PlTransaction, ResourceRef, SignedResourceId } from "@milaboratories/pl-client";
import { field, isNotNullSignedResourceId, resourceIdToString } from "@milaboratories/pl-client";
import { randomUUID } from "node:crypto";
import type { ProjectMeta } from "@milaboratories/pl-model-middle-layer";
import type { ProjectId } from "@milaboratories/pl-model-common";
import { ProjectMetaKey } from "../model/project_model";
import { duplicateProject } from "./project";
import type { ProjectHelper } from "../model/project_helper";
import type {
  EnvelopeData,
  EnvelopeAcceptance,
  EnvelopeMode,
  EnvelopeProject,
  ProjectFieldUuid,
  ShareId,
  SharingDecision,
} from "../model/sharing_model";
import {
  SharedEnvelopeResourceType,
  acceptanceField,
  decisionField,
  newShareId,
} from "../model/sharing_model";

/** Field name carrying a project snapshot inside a {@link SharedEnvelopeResourceType}. */
export const EnvelopeProjectFieldPrefix = "project/";
export const envelopeProjectField = (uuid: ProjectFieldUuid) =>
  `${EnvelopeProjectFieldPrefix}${uuid}`;

/** True for an envelope field that carries a project snapshot. */
export function isEnvelopeProjectField(name: string): boolean {
  return name.startsWith(EnvelopeProjectFieldPrefix);
}

/** Extracts the project field uuid from a `project/{uuid}` field name. */
export function envelopeProjectFieldUuid(name: string): ProjectFieldUuid {
  return name.slice(EnvelopeProjectFieldPrefix.length) as ProjectFieldUuid;
}

//
// Donor side
//

/**
 * One project going into an envelope: `fresh` snapshots a live source (normal path); `carry`
 * re-attaches an existing snapshot (change's "keep", or an "update" whose source is gone).
 */
export type EnvelopeProjectSource =
  | { kind: "fresh"; projectId: ProjectId; sourceRid: SignedResourceId }
  | {
      kind: "carry";
      projectId: ProjectId;
      label: string;
      snapshotRid: SignedResourceId;
      /** ms epoch the carried snapshot was last taken; preserved so "keep" keeps its timestamp. */
      updatedAt: number;
    };

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
  sources: EnvelopeProjectSource[],
  params: {
    mode: EnvelopeMode;
    sender: string;
    title: string;
    /** ms epoch; sharedAt + ttl for a targeted share, null for share-with-everybody. */
    expiresAt: number | null;
    /** Existing shareId for a change; a fresh one is minted when omitted. */
    shareId?: ShareId;
    sharedAt?: number;
  },
  projectHelper: ProjectHelper,
): Promise<{ envelope: ResourceRef; data: EnvelopeData }> {
  const shareId = params.shareId ?? newShareId();
  const sharedAt = params.sharedAt ?? Date.now();

  // Snapshot (fresh) or re-attach (carry) each project, collecting its metadata for the pack.
  const projects: Record<ProjectFieldUuid, EnvelopeProject> = {};
  const snapshots: { uuid: ProjectFieldUuid; ref: ResourceRef | SignedResourceId }[] = [];
  for (const src of sources) {
    const uuid = randomUUID() as ProjectFieldUuid;
    if (src.kind === "fresh") {
      const meta = await tx.getKValueJson<ProjectMeta>(src.sourceRid, ProjectMetaKey);
      const ref = await duplicateProject(tx, src.sourceRid, projectHelper, { label: meta.label });
      projects[uuid] = { label: meta.label, source: src.projectId, updatedAt: sharedAt }; // (re)snapshotted now
      snapshots.push({ uuid, ref });
    } else {
      // Re-attach the prior snapshot; the new envelope references it before the old one is
      // detached in the same tx, so it stays alive. Label and timestamp carry unchanged.
      projects[uuid] = { label: src.label, source: src.projectId, updatedAt: src.updatedAt };
      snapshots.push({ uuid, ref: src.snapshotRid });
    }
  }

  const data: EnvelopeData = {
    schemaVersion: 1,
    shareId,
    sharedAt,
    expiresAt: params.expiresAt,
    mode: params.mode,
    sender: params.sender,
    title: params.title,
    projects,
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
 * Records a response onto the envelope as a dynamic `acceptance/{login}` field: the acceptor
 * writing their own decision (their writable grant permits it), or the donor transferring an
 * existing record onto a changed envelope. Accepts the envelope by ref or id.
 */
export function writeEnvelopeAcceptance(
  tx: PlTransaction,
  envelopeRid: ResourceRef | SignedResourceId,
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
  shareId: ShareId,
  decision: SharingDecision,
): void {
  const value = tx.createJsonValue(decision);
  tx.createField(field(stateRid, decisionField(shareId)), "Dynamic", value);
}

/**
 * Copies every project snapshot inside an envelope into the acceptor's own project list — a
 * cross-color attach the backend permits. Mirrors {@link duplicateProject}'s `rename` contract,
 * but resolves the source against the envelope tree (not the acceptor's own list), so the
 * wrapper cannot be reused.
 *
 * @returns ids of the projects created in the acceptor's list.
 */
export async function copyEnvelopeProjectsIntoList(
  tx: PlTransaction,
  envelopeRid: SignedResourceId,
  projectListRid: SignedResourceId,
  projectHelper: ProjectHelper,
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
    const newPrj = await duplicateProject(tx, sourceRid, projectHelper, { label: newLabel });
    tx.createField(field(projectListRid, randomUUID()), "Dynamic", newPrj);

    const signedRid = await newPrj.globalId;
    created.push(signedRid);
  }

  return created;
}

/** String-form ids of the projects created by {@link copyEnvelopeProjectsIntoList}. */
export function resourceIdsToStrings(ids: SignedResourceId[]): string[] {
  return ids.map((id) => resourceIdToString(id));
}
