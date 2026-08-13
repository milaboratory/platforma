import type { CompiledBlockKind, CompiledBlockKindV1 } from "./descriptor";

export type { CompiledBlockKind, InferBlockParams } from "./descriptor";

/**
 * What {@link defineBlockKind} is given: the descriptor minus what a caller does not supply.
 *
 * Derived rather than declared, because a copy of the same fields would let the input and the
 * descriptor drift — and their documentation with them. A field added to the descriptor
 * therefore has to be supplied here too, which is the right default.
 *
 * Two exclusions, and both are things a caller cannot state: `kindSchema` is this package's to
 * stamp, and `__PHANTOM_BLOCK_PARAMS__` is a type-level slot that never holds a value — the
 * factory does not copy it, so accepting it would be accepting something that gets dropped.
 */
export type BlockKindMeta<BlockParams = unknown> = Omit<
  CompiledBlockKindV1<BlockParams>,
  "kindSchema" | "__PHANTOM_BLOCK_PARAMS__"
>;

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
 * A kind must also declare `parseInitializationParams` — the runtime check applied to params
 * that came from a template file rather than from typed code. See
 * {@link CompiledBlockKind} for what it must do.
 *
 * @typeParam BlockParams - shape of the params a block of this kind reads. Pinned both
 *   as a type and by `parseInitializationParams`, whose return type is checked against it.
 */
export function defineBlockKind<BlockParams>(
  meta: BlockKindMeta<BlockParams>,
): CompiledBlockKind<BlockParams> {
  // Frozen v1 descriptor. The phantom param slot is never assigned. Nothing serializes
  // this object: only its name and version are read, to compose the `{name}@{version}`
  // reference, and the parser is called in place.
  return Object.freeze({
    kindSchema: "v1" as const,
    name: meta.name,
    version: meta.version,
    parseInitializationParams: meta.parseInitializationParams,
  });
}
