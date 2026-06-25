import type { ResourceType, Role } from "@milaboratories/pl-client";
import { Role as RoleEnum } from "@milaboratories/pl-client";
import type { Branded } from "@milaboratories/pl-model-common";
import { randomUUID } from "node:crypto";

/**
 * Logical identity of a share, stable across replaces. A donor-generated UUID string,
 * branded so it cannot be silently confused with a project id, a login, or a raw field
 * name. Minted once with {@link newShareId}; every other site receives it (from decoded
 * {@link EnvelopeData} or by parsing a `decision/{shareId}` field name) and threads it
 * through unchanged.
 */
export type ShareId = Branded<string, "ShareId">;

/** Mints a fresh {@link ShareId}. The single place a share's logical identity is created. */
export function newShareId(): ShareId {
  return randomUUID() as ShareId;
}

/** Brands a string already known to be a share id (e.g. parsed from a `decision/{shareId}`
 *  field name) as a {@link ShareId}, without minting a new one. */
export function asShareId(id: string): ShareId {
  return id as ShareId;
}

//
// Pl Model — Project Sharing
//
// All sharing structures are defined and managed by the middle layer; the
// backend knows nothing about envelopes. See
// docs/text/work/projects/project-sharing/implementation-details.md §"Data model".
//

/** Field on the donor's clientRoot holding the {@link SharingOutboxResourceType} resource. */
export const SharingOutboxField = "sharingOutbox";
/** Field on the acceptor's clientRoot holding the {@link SharingStateResourceType} resource. */
export const SharingStateField = "sharingState";

export const SharingOutboxResourceType: ResourceType = { name: "SharingOutbox", version: "1" };
export const SharedEnvelopeResourceType: ResourceType = { name: "SharedEnvelope", version: "1" };
export const SharingStateResourceType: ResourceType = { name: "SharingState", version: "1" };

export type EnvelopeMode = "copy" | "read-only" | "collaboration";

/**
 * Whether a role may make a resource public (grant to everyone). Mirrors the backend's
 * authorization rule `util/misecurity/role.go` `CanGrantToEveryone` — true for controller,
 * admin, and user; false for workflow and unspecified. The middle layer carries no policy
 * beyond mirroring the backend: a crafted call still hits the backend's role + permission-ceiling
 * gate. `null` (no-auth mode) returns false. Rebinds to a per-user backend capability if the
 * backend later exposes one (the admins-only restriction / future multitenant model).
 */
export function canGrantToEveryone(role: Role | null): boolean {
  switch (role) {
    case RoleEnum.CONTROLLER:
    case RoleEnum.ADMIN:
    case RoleEnum.USER:
      return true;
    default:
      return false;
  }
}

/** Immutable `data` on a SharedEnvelope, set at createEphemeral, never mutated. */
export interface EnvelopeData {
  schemaVersion: 1;
  shareId: ShareId; // donor-generated UUID; logical share identity, stable across replaces
  sharedAt: number; // ms epoch; this instance's creation time — distinguishes instances of one shareId
  expiresAt: number | null; // ms epoch; sharedAt + ttl (default 14 days) for a targeted share; null for share-with-everybody (never expires)
  mode: EnvelopeMode; // what the acceptor's app should do with the contents
  sender: string; // donor login (informational; backend granted_by is authoritative)
  message?: string; // optional message shown with the pending share
  projectLabels: Record<string, string>; // labels of contained projects, keyed by project field uuid; carried so the pending-share UI renders without traversing into the projects
}

/** Dynamic field on SharingState, one per handled share, keyed by shareId. */
export const decisionField = (shareId: ShareId) => `decision/${shareId}`;

export interface SharingDecision {
  decision: "accepted" | "rejected";
  timestamp: number; // ms epoch — when the acceptor acted
  envelopeSharedAt: number; // the acted-on envelope instance's sharedAt — pins which instance was handled (paired with the shareId key; the resource id is never stored)
  acceptedProjects: string[]; // ids of the projects created in the acceptor's list ([] for a rejected share)
}

/** Dynamic field on SharedEnvelope, one per recipient who accepted or rejected, keyed
 *  by recipient login. Written by the acceptor in read-write shares only (Copy & Share,
 *  Live collaboration) — the acceptor's writable envelope grant is what permits the
 *  write; read-only shares omit it. The donor reads these from its own outbox to see
 *  who responded and when. Informational, not authoritative (a writable grant holder
 *  could write under another login — same trust assumption as the sender field).
 *  Copied forward when a share is replaced. */
export const acceptanceField = (login: string) => `acceptance/${login}`;

export interface EnvelopeAcceptance {
  action: "accepted" | "rejected";
  timestamp: number; // ms since epoch
}

/**
 * Single owner of the raw-data → {@link EnvelopeData} decode. The envelope's immutable `data`
 * blob is UTF-8 JSON set once at createEphemeral; every site that reads it from a raw resource
 * `data` byte buffer (the basic-resource read path) goes through here. The reactive tree-node
 * path uses `node.getDataAsJson<EnvelopeData>()`, which decodes the same JSON.
 */
export function decodeEnvelopeData(data: Uint8Array): EnvelopeData {
  return JSON.parse(Buffer.from(data).toString("utf-8")) as EnvelopeData;
}

/**
 * Options for {@link MiddleLayer.shareProjects}.
 *
 * Recipients XOR everyone — two clean variants, not one struct with mutually exclusive
 * optional fields. The everyone variant issues a single make-public grant (the envelope's
 * `expiresAt` is set to `null`, so it never expires); the recipients variant grants each
 * named recipient and the envelope expires after the default TTL.
 */
export type ShareProjectsOptions =
  | {
      recipients: string[]; // recipient logins
      message?: string; // optional message shown with the pending share
      mode: EnvelopeMode; // v1 UI always sends "copy"
    }
  | {
      everyone: true; // share with all users on the server
      message?: string;
      mode: EnvelopeMode;
    };
