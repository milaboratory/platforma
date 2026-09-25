import type { PlTransaction, ResourceRef, SignedResourceId } from "@milaboratories/pl-client";
import { field, isNotNullSignedResourceId } from "@milaboratories/pl-client";
import { randomUUID } from "node:crypto";
import type { FolderId, ProjectMeta } from "@milaboratories/pl-model-middle-layer";
import { normalizeDescription } from "@milaboratories/pl-model-middle-layer";
import type { ProjectId, ProjectTemplateV1, TemplateId } from "@milaboratories/pl-model-common";
import { ProjectMetaKey } from "../model/project_model";
import { duplicateProject } from "./project";
import type {
  EnvelopeData,
  EnvelopeFolder,
  EnvelopeFolderId,
  EnvelopeFolderProject,
  EnvelopeFolderTemplate,
  EnvelopeMode,
  EnvelopeProject,
  ProjectFieldUuid,
  ShareId,
  ShareHidden,
} from "../model/sharing_model";
import {
  EnvelopeSchemaVersionCurrent,
  SharedEnvelopeResourceType,
  hiddenField,
  newProjectFieldUuid,
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

/** One live project going into an envelope; it is snapshotted as the envelope is built. */
export type EnvelopeProjectSource = { projectId: ProjectId; sourceRid: SignedResourceId };

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
  },
): Promise<{ envelope: ResourceRef; data: EnvelopeData }> {
  const sharedAt = Date.now();
  const snapshots = await snapshotEnvelopeProjects(tx, sources, sharedAt);

  const projects: Record<ProjectFieldUuid, EnvelopeProject> = {};
  for (const { uuid, project } of snapshots) projects[uuid] = project;

  const data: EnvelopeData = {
    schemaVersion: EnvelopeSchemaVersionCurrent,
    shareId: newShareId(),
    sharedAt,
    expiresAt: params.expiresAt,
    mode: params.mode,
    sender: params.sender,
    title: params.title,
    payload: { kind: "projects", projects },
  };

  return { envelope: sealEnvelope(tx, outboxRid, data, snapshots), data };
}

/**
 * Builds one {@link SharedEnvelopeResourceType} carrying a template document on the donor side,
 * and attaches it under `{shareId}` on the donor's outbox. The caller issues the grant — always
 * read-only — and commits, keeping create + grant atomic.
 *
 * There is nothing to snapshot and no input field to seal: the document is the whole payload and
 * rides in the envelope's immutable `data`, which is also why the recipient needs no write access
 * (it copies no resource out of the envelope).
 *
 * @returns the new envelope resource and the generated `EnvelopeData`.
 */
export function buildTemplateShareEnvelope(
  tx: PlTransaction,
  outboxRid: SignedResourceId,
  template: {
    document: ProjectTemplateV1;
    label: string;
    description?: string;
    source: TemplateId;
  },
  params: {
    sender: string;
    title: string;
    /** ms epoch; sharedAt + ttl for a targeted share, null for share-with-everybody. */
    expiresAt: number | null;
  },
): { envelope: ResourceRef; data: EnvelopeData } {
  const data: EnvelopeData = {
    schemaVersion: EnvelopeSchemaVersionCurrent,
    shareId: newShareId(),
    sharedAt: Date.now(),
    expiresAt: params.expiresAt,
    mode: "read-only",
    sender: params.sender,
    title: params.title,
    payload: {
      kind: "template",
      document: template.document,
      source: template.source,
      label: template.label,
      ...(template.description === undefined ? {} : { description: template.description }),
      from: params.sender,
    },
  };

  return { envelope: sealEnvelope(tx, outboxRid, data, []), data };
}

/**
 * Builds one {@link SharedEnvelopeResourceType} carrying a folder subtree: the folders, every
 * project in them snapshotted as a `project/{uuid}` field, and every template's document inline.
 * Attaches it under `{shareId}` on the donor's outbox. The caller issues the grant — writable,
 * because the recipient copies the project snapshots out — and commits.
 *
 * Folder ids are minted here and mean nothing outside this envelope: the recipient's own document
 * mints its own. What travels is the shape of the subtree.
 *
 * @returns the new envelope resource and the generated `EnvelopeData`.
 */
export async function buildFolderShareEnvelope(
  tx: PlTransaction,
  outboxRid: SignedResourceId,
  subtree: EnvelopeFolderSubtree,
  params: {
    sender: string;
    title: string;
    /** ms epoch; sharedAt + ttl for a targeted share, null for share-with-everybody. */
    expiresAt: number | null;
  },
): Promise<{ envelope: ResourceRef; data: EnvelopeData }> {
  const sharedAt = Date.now();
  const snapshots = await snapshotEnvelopeProjects(tx, subtree.projects, sharedAt);

  const projects: Record<ProjectFieldUuid, EnvelopeFolderProject> = {};
  for (const { uuid, project, source } of snapshots)
    projects[uuid] = { ...project, folder: source.folder };

  const data: EnvelopeData = {
    schemaVersion: EnvelopeSchemaVersionCurrent,
    shareId: newShareId(),
    sharedAt,
    expiresAt: params.expiresAt,
    mode: "copy",
    sender: params.sender,
    title: params.title,
    payload: {
      kind: "folder",
      source: subtree.source,
      folders: subtree.folders,
      projects,
      templates: subtree.templates,
      from: params.sender,
    },
  };

  return { envelope: sealEnvelope(tx, outboxRid, data, snapshots), data };
}

/** A folder subtree ready to be sealed into an envelope: the folders under their envelope-local
 *  ids, the live projects to snapshot, and the templates to carry whole. */
export interface EnvelopeFolderSubtree {
  /** Donor's own id of the shared folder, carried so a later share of it finds this one. */
  source: FolderId;
  folders: Record<EnvelopeFolderId, EnvelopeFolder>;
  projects: (EnvelopeProjectSource & { folder: EnvelopeFolderId })[];
  templates: EnvelopeFolderTemplate[];
}

//
// Recipient side
//

/**
 * Puts a share out of this recipient's sight, as a dynamic field on their own SharingState.
 * Keyed on the shareId, so a share that replaces this one — a new shareId — is shown again.
 */
export function writeShareHidden(
  tx: PlTransaction,
  stateRid: SignedResourceId,
  shareId: ShareId,
  timestamp: number,
): void {
  const value = tx.createJsonValue({ hidden: true, timestamp } satisfies ShareHidden);
  tx.createField(field(stateRid, hiddenField(shareId)), "Dynamic", value);
}

/** Brings a hidden share back into this recipient's list. */
export function clearShareHidden(
  tx: PlTransaction,
  stateRid: SignedResourceId,
  shareId: ShareId,
): void {
  tx.removeField(field(stateRid, hiddenField(shareId)));
}

/**
 * Copies every project snapshot inside an envelope into the recipient's own project list — a
 * cross-color attach the backend permits. The source is resolved against the envelope tree, not
 * the recipient's own list.
 *
 * `label` names each copy from its snapshot's label. The caller picks the names against the
 * destination the copies land in, because that is where they have to be free; left out, each copy
 * keeps its snapshot's label.
 *
 * Each result carries the envelope field uuid it was copied from, because that uuid is what the
 * payload names a project by — a folder share reads the folder of each copy off it. Pairing by
 * position would happen to work today and quietly stop working the moment the order does.
 *
 * @returns one entry per copied project: the envelope uuid it came from and its new id.
 */
export async function copyEnvelopeProjectsIntoList(
  tx: PlTransaction,
  envelopeRid: SignedResourceId,
  projectListRid: SignedResourceId,
  label?: (sourceLabel: string) => string,
): Promise<{ uuid: ProjectFieldUuid; rid: SignedResourceId }[]> {
  // Enumerate the envelope's project/{uuid} input fields (signed envelope-colored ids).
  const envelopeData = await tx.getResourceData(envelopeRid, true);
  const sources = envelopeData.fields
    .filter((f) => isEnvelopeProjectField(f.name))
    .flatMap((f) =>
      isNotNullSignedResourceId(f.value)
        ? [{ uuid: envelopeProjectFieldUuid(f.name), sourceRid: f.value }]
        : [],
    );

  const created: { uuid: ProjectFieldUuid; rid: SignedResourceId }[] = [];
  for (const { uuid, sourceRid } of sources) {
    const sourceMeta = await tx.getKValueJson<ProjectMeta>(sourceRid, ProjectMetaKey);
    const newLabel = label === undefined ? sourceMeta.label : label(sourceMeta.label);

    // Cross-color attach: a new UserProject in the recipient's color whose fields point at
    // envelope-colored resources. Fails with PermissionDenied: color mismatch on a backend
    // that lacks crossTreeRefs:v1.
    const newPrj = await duplicateProject(tx, sourceRid, { ...sourceMeta, label: newLabel });
    tx.createField(field(projectListRid, randomUUID()), "Dynamic", newPrj);

    created.push({ uuid, rid: await newPrj.globalId });
  }

  return created;
}

//
// Internals
//

/** One source project snapshotted for an envelope: the field uuid it rides under, the snapshot
 *  itself, and what the payload says about it. */
type EnvelopeSnapshot<Source extends EnvelopeProjectSource> = {
  uuid: ProjectFieldUuid;
  ref: ResourceRef;
  source: Source;
  project: EnvelopeProject;
};

/**
 * Snapshots each source project by reference, in the given order, under a freshly minted field
 * uuid. The payload entry carries the project's label and description as they were at `sharedAt`,
 * so a share list renders without traversing into the snapshot.
 */
async function snapshotEnvelopeProjects<Source extends EnvelopeProjectSource>(
  tx: PlTransaction,
  sources: readonly Source[],
  sharedAt: number,
): Promise<EnvelopeSnapshot<Source>[]> {
  const snapshots: EnvelopeSnapshot<Source>[] = [];
  for (const source of sources) {
    const meta = await tx.getKValueJson<ProjectMeta>(source.sourceRid, ProjectMetaKey);
    const ref = await duplicateProject(tx, source.sourceRid, meta);
    const description = normalizeDescription(meta.description);
    snapshots.push({
      uuid: newProjectFieldUuid(),
      ref,
      source,
      project: {
        label: meta.label,
        source: source.projectId,
        updatedAt: sharedAt,
        ...(description === undefined ? {} : { description }),
      },
    });
  }
  return snapshots;
}

/**
 * Creates the envelope with its immutable `data`, attaches each snapshot as a `project/{uuid}`
 * input field, and hangs the envelope on the donor's outbox under its shareId.
 *
 * A payload that carries project snapshots has its input set sealed one-way, even when the
 * subtree it describes holds none, because such an envelope is granted writable. A template
 * payload has no input set to seal. The outbox attach happens in the same transaction, so the
 * held-resource rule keeps the ephemeral envelope alive.
 */
function sealEnvelope(
  tx: PlTransaction,
  outboxRid: SignedResourceId,
  data: EnvelopeData,
  snapshots: readonly { uuid: ProjectFieldUuid; ref: ResourceRef }[],
): ResourceRef {
  const envelope = tx.createEphemeral(SharedEnvelopeResourceType, JSON.stringify(data));

  for (const { uuid, ref } of snapshots)
    tx.createField(field(envelope, envelopeProjectField(uuid)), "Input", ref);
  if (data.payload.kind !== "template") tx.lockInputs(envelope);

  tx.createField(field(outboxRid, data.shareId), "Dynamic", envelope);
  return envelope;
}
