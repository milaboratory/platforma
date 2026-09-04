import type { ResourceType, Role } from "@milaboratories/pl-client";
import { Role as RoleEnum } from "@milaboratories/pl-client";
import type { Branded, ProjectId, ProjectTemplateV1 } from "@milaboratories/pl-model-common";
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
// backend knows nothing about envelopes.
//

/** Field on the donor's clientRoot holding the {@link SharingOutboxResourceType} resource. */
export const SharingOutboxField = "sharingOutbox";
/** Field on the acceptor's clientRoot holding the {@link SharingStateResourceType} resource. */
export const SharingStateField = "sharingState";

export const SharingOutboxResourceType: ResourceType = { name: "SharingOutbox", version: "1" };
export const SharedEnvelopeResourceType: ResourceType = { name: "SharedEnvelope", version: "1" };
export const SharingStateResourceType: ResourceType = { name: "SharingState", version: "1" };

export type EnvelopeMode = "copy" | "read-only" | "collaboration";

/** Per-project decision on change, matching the UI labels: re-snapshot the live source ("update"),
 *  carry the existing snapshot ("keep"), or drop the project from the pack ("remove"). */
export type ProjectChangeAction = "keep" | "update" | "remove";

/** Key of the per-project envelope maps: a uuid minted per snapshot to name the `project/{uuid}`
 *  field. Distinct from {@link ProjectId} — re-snapshotting one source yields a new uuid each time. */
export type ProjectFieldUuid = Branded<string, "ProjectFieldUuid">;

/**
 * Whether a role may make a resource public (grant to everyone): true for controller,
 * admin; false for workflow and unspecified. The middle layer carries no policy
 * of its own here — a crafted call still hits the backend's role + permission-ceiling gate.
 * `null` (no-auth mode) returns false.
 */
export function canGrantToEveryone(role: Role | null): boolean {
  switch (role) {
    case RoleEnum.CONTROLLER:
    case RoleEnum.ADMIN:
      return true;
    default:
      return false;
  }
}

/**
 * Whether a role may impersonate another user: open/create another user's root and list
 * the resources that user can access. Mirrors the backend's authorization rule
 * `util/misecurity/role.go` `CanImpersonate` — true for controller and admin only. This is
 * the admin gate for the "open another user's root" feature and is intentionally stricter
 * than {@link canGrantToEveryone}, which also returns true for a regular user (a normal user
 * may share their own projects, but must never be offered impersonation). `null` (no-auth
 * mode) returns false.
 */
export function canImpersonate(role: Role | null): boolean {
  switch (role) {
    case RoleEnum.CONTROLLER:
    case RoleEnum.ADMIN:
      return true;
    default:
      return false;
  }
}

/** One project's snapshot inside an envelope, keyed by {@link ProjectFieldUuid} in a
 *  `projects` {@link EnvelopePayload}. */
export interface EnvelopeProject {
  label: string; // carried so the pending-share UI renders without traversing into the project
  source: ProjectId; // donor's source projectId; supersedes a prior share and matches the snapshot to its live source on change
  updatedAt: number; // ms epoch of the last (re)snapshot
}

/**
 * What a share carries. The discriminant is what a reader checks before anything else: a
 * client that does not know a kind hides the share instead of offering something it cannot
 * act on.
 *
 * `projects` snapshots ride as `project/{uuid}` fields on the envelope and this map only
 * describes them; a `template` payload has no fields at all — the document is right here.
 */
export type EnvelopePayload =
  | { kind: "projects"; projects: Record<ProjectFieldUuid, EnvelopeProject> }
  | {
      kind: "template";
      document: ProjectTemplateV1;
      /** Label to give the template on the recipient's own shelf. */
      label: string;
      /** Donor login, kept on the accepted template as its provenance. */
      from: string;
    };

export type EnvelopePayloadKind = EnvelopePayload["kind"];

/** Every envelope schema version this build can read. Adding a version here is what makes
 *  {@link normalizeEnvelopeData} accept it; bumping {@link EnvelopeSchemaVersionCurrent} to a
 *  version missing from this union is a compile error. */
export type EnvelopeSchemaVersion = 1 | 2;

/** Version written into every new envelope. Bumped from 1 when the payload became discriminated. */
export const EnvelopeSchemaVersionCurrent = 2 satisfies EnvelopeSchemaVersion;

/**
 * Immutable `data` on a SharedEnvelope, set at createEphemeral, never mutated.
 *
 * Always the current version in memory: a v1 envelope (project map at the top level, no
 * `payload` field) is upcast on read by {@link normalizeEnvelopeData}, so no reader past the
 * decode has to know that two shapes ever existed.
 */
export interface EnvelopeData {
  schemaVersion: typeof EnvelopeSchemaVersionCurrent;
  shareId: ShareId; // donor-generated UUID; logical share identity, stable across changes
  sharedAt: number; // ms epoch; this instance's creation time — distinguishes instances of one shareId
  expiresAt: number | null; // ms epoch; sharedAt + ttl (default 14 days) for a targeted share; null for share-with-everybody (never expires)
  mode: EnvelopeMode; // what the acceptor's app should do with the contents
  sender: string; // donor login (informational; backend granted_by is authoritative)
  title: string; // display name shown to recipients; defaults to the first project's name
  payload: EnvelopePayload; // what the share carries
}

/** The project map of a projects-payload envelope, or `{}` for any other payload — the one
 *  place a project-shaped reader turns a payload into the map it expects. */
export function envelopeProjectMap(data: EnvelopeData): Record<ProjectFieldUuid, EnvelopeProject> {
  return data.payload.kind === "projects" ? data.payload.projects : {};
}

/** Dynamic field on SharingState, one per handled share, keyed by shareId. */
export const decisionField = (shareId: ShareId) => `decision/${shareId}`;

export interface SharingDecision {
  decision: "accepted" | "rejected";
  timestamp: number; // ms epoch — when the acceptor acted
  envelopeSharedAt: number; // the acted-on envelope instance's sharedAt — pins which instance was handled (paired with the shareId key; the resource id is never stored)
  acceptedProjects: string[]; // ids of the projects created in the acceptor's list ([] for a rejected share, and for a template share, which creates none)
}

/** Dynamic field on SharedEnvelope, one per recipient who accepted or rejected, keyed
 *  by recipient login. Written by the acceptor in read-write shares only (Copy & Share,
 *  Live collaboration) — the acceptor's writable envelope grant is what permits the
 *  write; read-only shares omit it. The donor reads these from its own outbox to see
 *  who responded and when. Informational, not authoritative (a writable grant holder
 *  could write under another login — same trust assumption as the sender field).
 *  Copied forward when a share is changed. */
export const AcceptanceFieldPrefix = "acceptance/";
export const acceptanceField = (login: string) => `${AcceptanceFieldPrefix}${login}`;
export const isAcceptanceField = (name: string) => name.startsWith(AcceptanceFieldPrefix);
export const acceptanceFieldLogin = (name: string) => name.slice(AcceptanceFieldPrefix.length);

export interface EnvelopeAcceptance {
  action: "accepted" | "rejected";
  timestamp: number; // ms since epoch
}

/**
 * Single owner of the raw-data → {@link EnvelopeData} decode. The envelope's immutable `data`
 * blob is UTF-8 JSON set once at createEphemeral; every site that reads it from a raw resource
 * `data` byte buffer (the basic-resource read path) goes through here. The reactive tree-node
 * path decodes the same JSON with `getDataAsJson` and normalizes it with
 * {@link normalizeEnvelopeData} — both paths must, so neither sees the raw v1 shape.
 *
 * `undefined` for an envelope this build cannot act on; see {@link normalizeEnvelopeData}.
 */
export function decodeEnvelopeData(data: Uint8Array): EnvelopeData | undefined {
  return normalizeEnvelopeData(JSON.parse(Buffer.from(data).toString("utf-8")));
}

/**
 * Brings a decoded envelope blob to the current shape, or reports that this build cannot act
 * on it by returning `undefined` — an unknown `schemaVersion` or an unknown payload kind. A
 * caller hides such a share rather than offering the recipient something it cannot handle.
 *
 * A v1 envelope carried its project map at the top level and had no `payload` field; it reads
 * here as a `projects` payload, so envelopes written before the discriminant existed keep
 * working unchanged.
 */
export function normalizeEnvelopeData(raw: unknown): EnvelopeData | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const e = raw as RawEnvelopeData;
  if (!Object.hasOwn(ReadableSchemaVersions, e.schemaVersion)) return undefined;

  const payload =
    e.payload ??
    (e.projects !== undefined ? ({ kind: "projects", projects: e.projects } as const) : undefined);
  if (payload === undefined) return undefined;
  if (!Object.hasOwn(KnownPayloadKinds, payload.kind)) return undefined;

  return {
    schemaVersion: EnvelopeSchemaVersionCurrent,
    shareId: e.shareId,
    sharedAt: e.sharedAt,
    expiresAt: e.expiresAt,
    mode: e.mode,
    sender: e.sender,
    title: e.title,
    payload,
  };
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
      title: string; // display name shown to recipients; defaults to the first project's name
      mode: EnvelopeMode; // v1 UI always sends "copy"
    }
  | {
      everyone: true; // share with all users on the server
      /**
       * When true and an everyone-share of the same project already exists, refresh it under its
       * stable shareId (recipients who already accepted or rejected are not re-prompted) instead of
       * minting a new share. No-op when no prior everyone-share of the project exists. Callers that
       * don't care pass `false`.
       */
      replace: boolean;
      title: string;
      mode: EnvelopeMode;
    };

/**
 * Options for {@link MiddleLayer.shareTemplate}.
 *
 * Recipients XOR everyone, exactly as {@link ShareProjectsOptions}, minus the mode: a template
 * share is always granted read-only, because the recipient copies no resource out of the
 * envelope — the document is in the envelope's own data.
 */
export type ShareTemplateOptions =
  | {
      recipients: string[]; // recipient logins
      title: string; // display name shown to recipients; defaults to the template's label
    }
  | {
      everyone: true; // share with all users on the server
      title: string;
    };

//
// Internals
//

/** Every payload kind this build can act on; anything else is hidden rather than offered.
 *  Keyed by {@link EnvelopePayloadKind}, so adding a kind to {@link EnvelopePayload} without
 *  teaching the decoder about it is a compile error, not a share that silently disappears. */
const KnownPayloadKinds: Record<EnvelopePayloadKind, true> = {
  projects: true,
  template: true,
};

/** Every schema version {@link normalizeEnvelopeData} accepts. Keyed by
 *  {@link EnvelopeSchemaVersion}, so widening that union without deciding how the new shape
 *  is upcast is a compile error. */
const ReadableSchemaVersions: Record<EnvelopeSchemaVersion, true> = {
  1: true,
  2: true,
};

/**
 * The envelope blob as it comes off the wire, before {@link normalizeEnvelopeData} decides
 * whether this build can act on it: the version is any number, the payload may be missing,
 * and `projects` is the v1 top-level project map.
 */
type RawEnvelopeData = Omit<EnvelopeData, "schemaVersion" | "payload"> & {
  schemaVersion: number;
  payload?: EnvelopePayload;
  projects?: Record<ProjectFieldUuid, EnvelopeProject>;
};
