import type { CompiledBlockKind } from "./descriptor";

export type { CompiledBlockKind, InferBlockParams } from "./descriptor";

// Reuse the canonical reference type from its lightest owner — this package
// introduces no reference type of its own. Consumed type-only, so ts-builder
// erases the import and the emitted runtime bundle depends on nothing external.
// @todo: never make reexports from already created packages
export type { PlRef } from "@milaboratories/pl-model-common";

/**
 * Define a block kind.
 *
 * `name` is the FULL npm package name of the kind (e.g.
 * `@platforma-open/milaboratories.mixcr-clonotyping.kind`) — exactly as the
 * template YAML writes it. The S3 `{org, name}` path is derived from this npm
 * name downstream via `npmNameToKindPath`; the compiled kind carries no separate
 * `organization` field. `name` / `version` are passed explicitly for now; a
 * later ts-builder target can synthesize them (from `package.json`) without
 * changing this public type contract.
 *
 * @typeParam BlockParams - shape of the params a block of this kind reads.
 *   Carried as a type only; see {@link CompiledBlockKind}.
 */
export function defineBlockKind<BlockParams>(meta: {
  name: string;
  version: string;
}): CompiledBlockKind<BlockParams> {
  // Frozen, serializable v1 descriptor. The phantom param slot is never assigned.
  return Object.freeze({
    kindSchema: "v1" as const,
    name: meta.name,
    version: meta.version,
  });
}
