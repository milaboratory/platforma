import { isColumnUniversalKey, remapColumnIdBlockIds } from "../drivers";
import type { PlRef } from "../ref";
import { createPlRef, isPlRef } from "../ref";
import type { TemplateLocalRef } from "./project_template_v1";
import { createTemplateLocalRef, isTemplateLocalRef } from "./project_template_v1";

/**
 * A kind's `Params` as they appear inside a template file: the same shape, with
 * every `PlRef` replaced by a {@link TemplateLocalRef}.
 *
 * A block's params in a live project carry `PlRef`s, whose `blockId` is a
 * project-local UUID. A template cannot carry those, so the file form names the
 * upstream entry instead. The mapping is a shape transform, not a
 * relabeling: `{ __isRef: true, blockId, name }` becomes `{ block, output }`.
 *
 * Nested carriers need no special case — `PrimaryRef`'s `column`/`filter` are
 * plain `PlRef` fields, so the recursion reaches them and `__isPrimaryRef`
 * survives untouched.
 *
 * A block id can also sit inside a column id — `GlobalPObjectId` and every wrapper
 * around it is a canonicalized-JSON *string*, so the id is behind one or more layers
 * of escaping where a property walk cannot see it. Those are converted in place by
 * `remapColumnIdBlockIds`, which parses each layer and re-canonicalizes: the value
 * stays a column id in both forms, because a template that rewrote it into
 * `{ block, output }` would no longer hold something a block could resolve. Only the
 * block id inside it differs between the two forms, which is why the type below maps
 * such a field to itself.
 *
 * What that leaves uncovered is a reference re-serialized on top of a column id — a
 * `JSON.stringify` of an id, say — since only the first parse layer is entered. The
 * export walk rejects params that still carry a block id afterwards, so such a case
 * fails loudly instead of corrupting a file.
 */
export type TemplateForm<T> = T extends PlRef
  ? TemplateLocalRef
  : // Before the object case, and not merely for tidiness: a branded id is
    // `string & { __brand }`, which satisfies `extends object`, so without this the
    // mapped type would walk `String.prototype` instead of leaving the id alone.
    T extends string
    ? T
    : T extends readonly (infer U)[]
      ? readonly TemplateForm<U>[]
      : T extends object
        ? { readonly [K in keyof T]: TemplateForm<T[K]> }
        : T;

/**
 * Project live params into template form: every `PlRef` becomes a
 * {@link TemplateLocalRef} naming the referenced block and output.
 *
 * The export half of the codec. Structural and kind-agnostic — this is what the
 * reservation rule on {@link TemplateLocalRef} buys, and why a block's
 * `templateParams` lambda returns its params in ordinary live form rather than
 * rewriting references itself.
 *
 * A `PlRef`'s `blockId` is copied through as the template-local `id` because
 * export names each block by the UUID it already has. Its
 * `requireEnrichments` flag is dropped: enrichments are out of scope for templates
 * (operator decision, 2026-07-30), so the file form has no slot for it.
 */
export function toTemplateForm<T>(value: T): TemplateForm<T> {
  return mapRefs(
    value,
    (ref) => createTemplateLocalRef(ref.blockId, ref.name),
    // Block ids inside column ids need no change: export names each block by the
    // UUID it already has, so a template-local id *is* the project-local one. The
    // identity map keeps every stored id byte-for-byte, and this is the single place
    // to change should entry ids ever stop being the block's own id.
    (blockId) => blockId,
  ) as TemplateForm<T>;
}

/**
 * Resolve template form back to live params: every {@link TemplateLocalRef}
 * becomes a `PlRef` whose `blockId` is `resolve(ref.block)`.
 *
 * The apply half of the codec. The engine passes a `resolve` that maps each
 * template-local id to the project-local UUID it just assigned, so the block's
 * init lambda only ever sees resolved references.
 *
 * @param resolve - template-local id → project-local UUID. Throw from it to
 *   reject a reference to an entry that does not exist.
 */
export function fromTemplateForm<T>(
  value: TemplateForm<T>,
  resolve: (templateLocalId: string) => string,
): T {
  return mapTemplateRefs(value, (ref) => createPlRef(resolve(ref.block), ref.output), resolve) as T;
}

/**
 * Walk `value`, replacing each `PlRef` with `fn(ref)`, remapping the block ids inside
 * every column id with `mapBlockId`, and leaving everything else structurally intact.
 * Recursion stops at a recognized reference or column id.
 *
 * A column id is checked *after* `isPlRef`: a bare `GlobalPObjectKey` is a `PlRef`, and
 * the reference form is the better thing for a template to carry when the value is not
 * wrapped in an id. It is checked *before* the generic object case, because descending
 * into a key would rewrite its nested ids as if they were plain properties.
 */
function mapRefs(
  value: unknown,
  fn: (ref: PlRef) => unknown,
  mapBlockId: (blockId: string) => string,
): unknown {
  if (isPlRef(value)) return fn(value);
  if (typeof value === "string") return remapColumnIdBlockIds(value, mapBlockId);
  if (isColumnUniversalKey(value)) return remapColumnIdBlockIds(value, mapBlockId);
  if (Array.isArray(value)) return value.map((v) => mapRefs(v, fn, mapBlockId));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mapRefs(v, fn, mapBlockId)]),
    );
  }
  return value;
}

/** {@link mapRefs} in the other direction. */
function mapTemplateRefs(
  value: unknown,
  fn: (ref: TemplateLocalRef) => unknown,
  mapBlockId: (blockId: string) => string,
): unknown {
  if (isTemplateLocalRef(value)) return fn(value);
  if (typeof value === "string") return remapColumnIdBlockIds(value, mapBlockId);
  if (isColumnUniversalKey(value)) return remapColumnIdBlockIds(value, mapBlockId);
  if (Array.isArray(value)) return value.map((v) => mapTemplateRefs(v, fn, mapBlockId));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mapTemplateRefs(v, fn, mapBlockId)]),
    );
  }
  return value;
}
