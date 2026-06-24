import type { ResourceType } from "@milaboratories/pl-client";

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

/** Immutable `data` on a SharedEnvelope, set at createEphemeral, never mutated. */
export interface EnvelopeData {
  schemaVersion: 1;
  shareId: string; // donor-generated UUID; logical share identity, stable across replaces
  sharedAt: number; // ms epoch; this instance's creation time — distinguishes instances of one shareId
  expiresAt: number | null; // ms epoch; sharedAt + ttl (default 14 days) for a targeted share; null for share-with-everybody (never expires)
  mode: EnvelopeMode; // what the acceptor's app should do with the contents
  sender: string; // donor login (informational; backend granted_by is authoritative)
  message?: string; // optional message shown with the pending share
  projectLabels: Record<string, string>; // labels of contained projects, keyed by project field uuid; carried so the pending-share UI renders without traversing into the projects
}

/** Dynamic field on SharingState, one per handled share, keyed by shareId. */
export const decisionField = (shareId: string) => `decision/${shareId}`;

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
 * Options for {@link MiddleLayer.shareProjects}. M1 ships only the targeted-recipients
 * variant; the share-with-everybody variant lands in M2.
 *
 * Recipients XOR everyone — two clean variants, not one struct with mutually exclusive
 * optional fields.
 */
export type ShareProjectsOptions = {
  recipients: string[]; // recipient logins
  message?: string; // optional message shown with the pending share
  mode: EnvelopeMode; // v1 UI always sends "copy"
};
