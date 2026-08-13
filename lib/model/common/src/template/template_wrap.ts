import { isColumnUniversalKey, peelJsonLayers } from "../drivers";
import { isTemplateRef, toTemplateRef } from "./template_ref";

/**
 * Mark every column identifier in a block's projected params as a reference.
 *
 * The half of the template contract that DOES know the reference system, and the reason the
 * engine does not have to. It runs inside the block's own model bundle, on whatever
 * `templateParams()` returned, and wraps each identifier it recognizes in a
 * {@link TemplateRef}. Downstream — document, file, apply — nothing else looks at what is
 * inside those wrappers.
 *
 * Automatic rather than the block author's job on purpose. Wrapping is not a decision: a
 * value either carries block ids or it does not, and this module can tell, while an author
 * who forgot would produce a template that silently applies wired to nothing. It also keeps
 * the kind's params contract written in live terms — `templateParams()` returns `Params`, not
 * some template-shaped variant of it.
 *
 * What counts as an identifier is exactly what `isColumnUniversalKey` accepts, in either
 * spelling: the key object (`PlRef` included — it IS `GlobalPObjectKey`) and the canonical
 * string, at whatever escape depth the value happens to sit. Recognition stops there and the
 * value is stored verbatim, so an identifier that nests other identifiers is wrapped once, as
 * a whole.
 *
 * A value already wrapped is left alone, so a block with an unusual carrier — a foreign JSON
 * document holding a reference, say — can wrap it by hand with {@link toTemplateRef} and have
 * that survive this pass.
 */
export function wrapTemplateRefs<T>(params: T): T {
  const walk = (node: unknown): unknown => {
    // Already declared by the block: take its word and do not look inside.
    if (isTemplateRef(node)) return node;

    if (typeof node === "string") return isIdentifierString(node) ? toTemplateRef(node) : node;

    // Before the generic object case: an identifier is an object too, and descending into one
    // would wrap the strings nested inside it instead of the identifier as a whole.
    if (isColumnUniversalKey(node)) return toTemplateRef(node);

    if (Array.isArray(node)) return node.map(walk);

    if (typeof node === "object" && node !== null) {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    }

    return node;
  };

  return walk(params) as T;
}

/**
 * Whether a params string is a canonical column identifier.
 *
 * Peeled first, so a value that was stringified again on its way into params is still
 * recognized — the string is wrapped exactly as found, since the redirect works on the text
 * and neither knows nor cares how many layers are around it.
 *
 * Ordinary strings are the common case and stop at the first character.
 */
function isIdentifierString(value: string): boolean {
  const peeled = peelJsonLayers(value);
  return peeled !== undefined && isColumnUniversalKey(peeled.value);
}
