import type { Branded } from "./branding";

/**
 * Opaque identifier for a project, safe to persist and reuse across sessions.
 * Internally this is a string derived from resource ID without signature.
 * Unlike SignedResourceId, this does not carry cryptographic signatures and can be
 * safely persisted, serialized, and reused across ML sessions.
 * Absence of signature guarantees this ID cannot be used in transactions 'as-is',
 * requiring the caller to operate with special types and helpers.
 */
export type ProjectId = Branded<string, "ProjectId">;

/**
 * Opaque identifier for a stored template, of exactly the same nature as {@link ProjectId}: a
 * stringified resource id without its signature, safe to persist and reuse across sessions.
 *
 * It lives beside {@link ProjectId} because projects and templates share one folder tree, and the
 * document that records that tree is written by a package that cannot see the middle layer's own
 * template types.
 */
export type TemplateId = Branded<string, "TemplateId">;

/** Brands a string already known to be a project id, such as one handed back by a caller. */
export function asProjectId(id: string): ProjectId {
  return id as ProjectId;
}

/** Brands a string already known to be a template id, such as one handed back by a caller. */
export function asTemplateId(id: string): TemplateId {
  return id as TemplateId;
}
