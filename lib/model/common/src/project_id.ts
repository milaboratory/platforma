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
