import type { ResourceType, Role } from "@milaboratories/pl-client";
import { Role as RoleEnum } from "@milaboratories/pl-client";
import type {
  Branded,
  ProjectId,
  ProjectTemplateV1,
  TemplateId,
} from "@milaboratories/pl-model-common";
import type { FolderId } from "@milaboratories/pl-model-middle-layer";
import { randomUUID } from "node:crypto";

/**
 * Identity of one share. A donor-generated UUID string,
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
/** Field on the recipient's clientRoot holding the {@link SharingStateResourceType} resource. */
export const SharingStateField = "sharingState";

export const SharingOutboxResourceType: ResourceType = { name: "SharingOutbox", version: "1" };
export const SharedEnvelopeResourceType: ResourceType = { name: "SharedEnvelope", version: "1" };
export const SharingStateResourceType: ResourceType = { name: "SharingState", version: "1" };

export type EnvelopeMode = "copy" | "read-only" | "collaboration";

/** Key of the per-project envelope maps: a uuid minted per snapshot to name the `project/{uuid}`
 *  field. Distinct from {@link ProjectId} — re-snapshotting one source yields a new uuid each time. */
export type ProjectFieldUuid = Branded<string, "ProjectFieldUuid">;

/** Mints a fresh {@link ProjectFieldUuid} for one snapshot. */
export function newProjectFieldUuid(): ProjectFieldUuid {
  return randomUUID() as ProjectFieldUuid;
}

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
  label: string; // carried so the share lists render without traversing into the project
  source: ProjectId; // donor's source projectId; what a prior share of the same project is matched on
  updatedAt: number; // ms epoch of the last (re)snapshot
  /** What the project said about itself when it was snapshotted, carried for the same reason as
   *  `label`. Absent when it had none, and on envelopes written before it was carried. */
  description?: string;
}

/**
 * Identifier of a folder inside one envelope.
 *
 * Local to the envelope, because the recipient's own folder document mints its own ids and the
 * donor's mean nothing there. What travels is the shape of the subtree, not its identity.
 */
export type EnvelopeFolderId = Branded<string, "EnvelopeFolderId">;

/** Mints a fresh {@link EnvelopeFolderId} for one folder of the envelope being built. */
export function newEnvelopeFolderId(): EnvelopeFolderId {
  return randomUUID() as EnvelopeFolderId;
}

/** One folder of a shared subtree. */
export interface EnvelopeFolder {
  name: string;
  /** Absent for the subtree's root — the folder that was shared. */
  parent?: EnvelopeFolderId;
  /** What the donor wrote about the folder. Absent when there is none. */
  description?: string;
}

/** A project of a shared subtree: an {@link EnvelopeProject} placed in the subtree. */
export interface EnvelopeFolderProject extends EnvelopeProject {
  folder: EnvelopeFolderId;
}

/** A template of a shared subtree. The document rides here whole, exactly as a `template`
 *  payload carries it — a template is never snapshotted. */
export interface EnvelopeFolderTemplate {
  document: ProjectTemplateV1;
  /** Label to give the template among the recipient's templates. */
  label: string;
  /** What the template says about itself. Absent when the donor described it with nothing. */
  description?: string;
  folder: EnvelopeFolderId;
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
      /** Donor's own id of the shared template; what a prior share of the same template is
       *  matched on. It names nothing in the recipient's tree, and envelopes written before it
       *  existed carry none — those match no later share of anything. */
      source?: TemplateId;
      /** Label to give the template among the recipient's templates. */
      label: string;
      /** What the template says about itself, carried to the recipient's copy. Absent when the
       *  donor described it with nothing. */
      description?: string;
      /** Donor login, kept on each copy of the template as its provenance. */
      from: string;
    }
  | {
      kind: "folder";
      /** Donor's own id of the shared folder; what a prior share of the same folder is matched
       *  on. It names nothing in the recipient's tree. */
      source: FolderId;
      /** The shared subtree. Exactly one folder has no parent, and that one is its root. */
      folders: Record<EnvelopeFolderId, EnvelopeFolder>;
      /** Project snapshots, each tagged with the folder of the subtree holding it. Their
       *  `project/{uuid}` fields are the same ones a `projects` payload describes. */
      projects: Record<ProjectFieldUuid, EnvelopeFolderProject>;
      /** Templates of the subtree, documents and all. Nothing of a template is snapshotted. */
      templates: EnvelopeFolderTemplate[];
      /** Donor login, kept on each copied template as its provenance. */
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
  shareId: ShareId; // donor-generated UUID; identity of this share alone
  sharedAt: number; // ms epoch; when the share was created
  expiresAt: number | null; // ms epoch; sharedAt + ttl (default 14 days) for a targeted share; null for share-with-everybody (never expires)
  mode: EnvelopeMode; // what the recipient's app should do with the contents
  sender: string; // donor login (informational; backend granted_by is authoritative)
  title: string; // display name shown to recipients; defaults to the first project's name
  payload: EnvelopePayload; // what the share carries
}

/** The project map of a projects-payload envelope, or `{}` for any other payload — the one
 *  place a project-shaped reader turns a payload into the map it expects. */
export function envelopeProjectMap(data: EnvelopeData): Record<ProjectFieldUuid, EnvelopeProject> {
  return data.payload.kind === "projects" ? data.payload.projects : {};
}

/**
 * The shared folder itself: the one folder of the subtree that has no parent.
 *
 * Derived rather than stored, so it cannot disagree with the folders beside it. `undefined` for
 * a subtree with no root or more than one, which is an envelope nothing can be reconstructed
 * from — the copy reports it rather than guessing which folder was meant.
 */
export function envelopeFolderRoot(
  folders: Record<EnvelopeFolderId, EnvelopeFolder>,
): EnvelopeFolderId | undefined {
  const roots = (Object.keys(folders) as EnvelopeFolderId[]).filter(
    (id) => folders[id].parent === undefined,
  );
  return roots.length === 1 ? roots[0] : undefined;
}

/**
 * Dynamic field on SharingState, one per share this user has hidden, keyed by shareId.
 *
 * Hiding is private to the recipient and reversible: the field is written to put a share out of
 * sight and removed to bring it back. It says nothing to the donor and nothing about whether
 * anything was ever copied out of the share — a share can be copied from any number of times,
 * before or after being hidden.
 *
 * The field name keeps its original `decision/` prefix. Records written before hiding replaced
 * accept/reject carry a different value under the same key, and every reader treats the presence
 * of the field as the whole answer: someone who accepted or rejected a share back then does not
 * want to see it, which is exactly what hidden means.
 */
export const HiddenFieldPrefix = "decision/";
export const hiddenField = (shareId: ShareId) => `${HiddenFieldPrefix}${shareId}`;
export const isHiddenField = (name: string) => name.startsWith(HiddenFieldPrefix);
export const hiddenFieldShareId = (name: string): ShareId =>
  asShareId(name.slice(HiddenFieldPrefix.length));

export interface ShareHidden {
  hidden: true;
  timestamp: number; // ms epoch — when the recipient hid it
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
 * Who a share is granted to: named recipients XOR everyone — two clean variants, not one struct
 * with mutually exclusive optional fields.
 *
 * The everyone variant issues a single make-public grant, and the envelope's `expiresAt` is `null`,
 * so it never expires. The recipients variant grants each named login, and the envelope expires
 * after the default TTL.
 */
export type ShareAudience =
  | { recipients: string[] } // recipient logins
  | { everyone: true }; // every user on the server

/**
 * Options every share takes: the audience, the title recipients see it under, and the prior
 * shares it replaces.
 */
export type ShareOptions = ShareAudience & {
  title: string;
  replace?: ShareReplaceOption;
};

/**
 * Prior shares the new one supersedes: each is deleted in the same transaction that creates the
 * replacement, so the outbox never holds both.
 *
 * The set is the caller's, never inferred here. The author is shown the shares that will go and
 * agrees to that list, so what was shown has to be what is deleted — an overlap rule computed on
 * this side would diverge from it. Ids that no longer resolve are skipped: a share revoked between
 * the dialog opening and the confirm is nothing to undo.
 *
 * The replacement is a new {@link ShareId}: a recipient who had hidden the old share sees the new
 * one, and copies already taken from the old share are untouched.
 */
export type ShareReplaceOption = ShareId[];

/** Options for {@link MiddleLayer.shareProjects}: the common ones, plus what the recipient's app
 *  does with the projects. */
export type ShareProjectsOptions = ShareOptions & { mode: EnvelopeMode };

/** Options for {@link MiddleLayer.shareTemplate}. */
export type ShareTemplateOptions = ShareOptions;

/** Options for {@link MiddleLayer.shareFolder}. */
export type ShareFolderOptions = ShareOptions;

/** What creating a share hands back: the id of the share just created. */
export type ShareOutcome = { readonly shareId: ShareId };

//
// Internals
//

/** Every payload kind this build can act on; anything else is hidden rather than offered.
 *  Keyed by {@link EnvelopePayloadKind}, so adding a kind to {@link EnvelopePayload} without
 *  teaching the decoder about it is a compile error, not a share that silently disappears. */
const KnownPayloadKinds: Record<EnvelopePayloadKind, true> = {
  projects: true,
  template: true,
  folder: true,
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
