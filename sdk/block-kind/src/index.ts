import type { CompiledBlockKind } from "./descriptor";

export type { CompiledBlockKind, InferBlockParams } from "./descriptor";

// Reuse the canonical reference type from its lightest owner — this package
// introduces no reference type of its own. Consumed type-only, so ts-builder
// erases the import and the emitted runtime bundle depends on nothing external.
// @todo: never make reexports from already created packages
export type { PlRef } from "@milaboratories/pl-model-common";

/** A kind's identity, as declared in its own `package.json`. */
export interface BlockKindMeta {
  /**
   * The FULL npm package name of the kind, e.g.
   * `@platforma-open/milaboratories.mixcr-clonotyping.kind`. The S3 `{org, name}`
   * path is derived from this downstream via `npmNameToKindPath`; the descriptor
   * carries no separate `organization` field.
   */
  name: string;
  version: string;
}

/**
 * Define a block kind.
 *
 * `meta` is the kind's identity — its own `{ name, version }`. Source it from
 * the package's `package.json` rather than hand-typing literals, so the on-wire
 * `{name}@{version}` cannot drift from what npm publishes and what the S3
 * manifest records (all read the same `package.json`):
 *
 * ```ts
 * // a kind package's src/index.ts
 * import { name, version } from "../package.json" with { type: "json" };
 * export const kind = defineBlockKind<Params>({ name, version });
 * ```
 *
 * rolldown inlines the JSON import (tree-shaken to the two strings) into the
 * bundled `kind.js`, so no build-time injection is needed.
 *
 * @typeParam BlockParams - shape of the params a block of this kind reads.
 *   Carried as a type only; see {@link CompiledBlockKind}.
 */
export function defineBlockKind<BlockParams>(meta: BlockKindMeta): CompiledBlockKind<BlockParams> {
  // Frozen, serializable v1 descriptor. The phantom param slot is never assigned.
  return Object.freeze({
    kindSchema: "v1" as const,
    name: meta.name,
    version: meta.version,
  });
}
