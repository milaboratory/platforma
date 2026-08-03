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
 * NOT covered: a reference embedded in a `PObjectId` (`GlobalPObjectId` is a
 * canonicalized-JSON *string* holding a block UUID, as `EnrichmentRef.hit` and
 * `EnrichmentStep.linker` use). Those are opaque to a structural walk, so any
 * UUID inside them survives export and goes stale on apply. Deliberately left
 * uncovered rather than overlooked: rewriting inside the string would require the
 * apply side to re-canonicalize at a matching escape depth, and no block is known
 * to put such a reference in its params. The export walk rejects params that still
 * carry a block id, so the case fails loudly instead of corrupting a file.
 */
export type TemplateForm<T> = T extends PlRef
  ? TemplateLocalRef
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
  return mapRefs(value, (ref) => createTemplateLocalRef(ref.blockId, ref.name)) as TemplateForm<T>;
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
  return mapTemplateRefs(value, (ref) => createPlRef(resolve(ref.block), ref.output)) as T;
}

/**
 * Walk `value`, replacing each `PlRef` with `fn(ref)` and leaving everything else
 * structurally intact. Recursion stops at a recognized reference.
 */
function mapRefs(value: unknown, fn: (ref: PlRef) => unknown): unknown {
  if (isPlRef(value)) return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapRefs(v, fn));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapRefs(v, fn)]));
  }
  return value;
}

/** {@link mapRefs} in the other direction. */
function mapTemplateRefs(value: unknown, fn: (ref: TemplateLocalRef) => unknown): unknown {
  if (isTemplateLocalRef(value)) return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapTemplateRefs(v, fn));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapTemplateRefs(v, fn)]));
  }
  return value;
}
