import type { PlRef } from "../ref";

/**
 * A reference as a person writes it: the entry it points at, and the output name.
 *
 * The readable spelling of a {@link PlRef}, and input only. The two say the same thing, and
 * differ only in what a reader has to carry:
 *
 * ```yaml
 * # what an export writes, and what a block holds
 * sources:
 *   - __isRef: true
 *     blockId: samples
 *     name: numbers
 *
 * # the same reference, written by hand
 * sources:
 *   - { block: samples, name: numbers }
 * ```
 *
 * `block` is a template-local entry id — the same thing a `PlRef`'s `blockId` holds inside a
 * template file. Nothing else: this form exists to drop the `__isRef` marker and the word
 * `blockId`, not to introduce a second way of naming an entry.
 *
 * Export never emits it — a block holds live `PlRef`s and a template holds what the block
 * holds. It is expanded on the way in, inside the block's own bundle and before the kind's
 * parser runs, so a kind's params contract is written against `PlRef` alone and never learns
 * this type exists.
 */
export type TemplatePlRef = {
  /** The template-local id of the entry this points at. */
  readonly block: string;
  /** The upstream output's name, exactly as a `PlRef` spells it. */
  readonly name: string;
};

/**
 * Whether `value` is a reference in the readable spelling.
 *
 * Exact about its keys, because the shape lives inside params a kind owns: `{ block, name }`
 * and nothing else. A value carrying `__isRef` is a `PlRef` already and is not this — the two
 * are told apart by shape and never overlap.
 */
export function isTemplatePlRef(value: unknown): value is TemplatePlRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("block") || !keys.includes("name")) return false;
  const { block, name } = value as { block: unknown; name: unknown };
  return typeof block === "string" && typeof name === "string";
}

/**
 * Expand every readable reference form in `params` into the form the system stores.
 *
 * Named for the job and not for today's only case. One readable form exists so far —
 * {@link TemplatePlRef}, the leaf reference — and the rest of the identifier system is meant to
 * follow: `TemplateCUId` / `TemplateCUKey`, readable spellings of the filtered, discovered and
 * overridden column keys, whose long forms are far worse to type than a `PlRef`'s.
 *
 * **Adding one is a recognizer plus an expander**, checked before the generic object case, the
 * way `isTemplatePlRef` / `expandTemplatePlRef` are below. Two rules a nesting form has to
 * respect, both consequences of how the stored forms are built:
 *
 * - **Expand bottom-up.** A wrapper key holds its source as a canonical *string*, not as an
 *   object, so the inner reference must be expanded and serialized before the outer key can be
 *   assembled. Descending after building the outer form would leave the inner spelling inside a
 *   string nothing looks at again.
 * - **Canonicalize what you build.** An identifier IS its canonical string; a key assembled
 *   with keys in another order is a different identifier for the same column.
 *
 * What comes out names its upstreams by template-local entry id — the same thing a `PlRef` in a
 * template file means. Turning those into the ids of real blocks is {@link relocateBlockIds},
 * which runs right after and treats an expanded reference exactly like one the file spelled out
 * in full.
 *
 * Needs nothing but the params. That is a property of the forms, not a coincidence: a readable
 * spelling carries the same information as the form it stands for, so expansion is a rewrite and
 * never a lookup. A form that needed the document to expand — a reference by position, say —
 * would have to be resolved somewhere that knows the document, and would drag that knowledge
 * into every caller of this. Keep them information-preserving.
 */
export function expandTemplateRefs<T>(params: T): T {
  const walk = (node: unknown): unknown => {
    // One line per readable form, before the generic object case: a form IS an object, and
    // descending into one would rewrite its parts instead of expanding it as a whole.
    if (isTemplatePlRef(node)) return expandTemplatePlRef(node);

    if (Array.isArray(node)) return node.map(walk);

    if (typeof node === "object" && node !== null) {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    }

    return node;
  };
  return walk(params) as T;
}

/**
 * The leaf form's expander: `{ block, name }` becomes the `PlRef` it stands for.
 *
 * An id naming no entry is passed through, like a hand-written `PlRef` would be: an id naming
 * nothing and an id naming an entry created later are indistinguishable, and both are meant to
 * arrive at a block that reports itself as missing references.
 */
function expandTemplatePlRef(ref: TemplatePlRef): PlRef {
  return { __isRef: true, blockId: ref.block, name: ref.name };
}
