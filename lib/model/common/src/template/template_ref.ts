/**
 * The one thing a template engine knows about the data it carries.
 *
 * Everything a block projects into template params travels **as is**: the engine does not
 * parse it, does not canonicalize it, and does not know a `PlRef` from a filtered column id
 * from a linker path. The only structure it recognizes is this wrapper, and the block is who
 * puts it there — see {@link toTemplateRef}.
 *
 * That is the whole point of the shape. A reference is the one thing a template cannot store
 * verbatim, because the block ids inside it belong to the project that was exported, so the
 * engine has to find those ids and redirect them. Making the block declare where they are
 * means the engine needs no model of the reference system at all — and it stays correct when
 * that system grows a sixth key form, a new nesting level, or a new place to hide an id.
 *
 * @typeParam T Whatever the block wrapped. The engine's view of it is `unknown`.
 */
export type TemplateRef<T = unknown> = { readonly $ref: T };

/** {@link toTemplateRef}'s result: an absent value stays absent rather than wrapping nothing. */
export type TemplateRefOf<T> = undefined extends T ? TemplateRef<T> | undefined : TemplateRef<T>;

/**
 * Mark a value in template params as carrying references the engine may redirect.
 *
 * Normally not called by a block: `wrapTemplateRefs` runs over whatever `templateParams()`
 * returns and marks every column identifier in it, so wrapping is not something an author can
 * forget. This is the escape hatch for the case that walk cannot recognize — a value that
 * carries block ids without being an identifier, a foreign JSON document holding a reference
 * — and a value already wrapped is left alone by the walk.
 *
 * `undefined` passes through unwrapped, so an optional field stays optional instead of
 * becoming a wrapper around nothing.
 */
export function toTemplateRef<T>(value: T): TemplateRefOf<T> {
  return (value === undefined ? undefined : { $ref: value }) as TemplateRefOf<T>;
}

/**
 * Whether `value` is a {@link TemplateRef} — an object whose only key is `$ref`.
 *
 * Exact, because the shape is reserved anywhere inside opaque params. `$`-prefixed and
 * single-key is about as narrow as a reserved shape gets, and it is the JSON-Schema spelling
 * of the same idea, so it reads as a reference to someone who has never seen this format.
 */
export function isTemplateRef(value: unknown): value is TemplateRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "$ref";
}

/**
 * Rewrite the block ids inside one reference payload, textually.
 *
 * The payload is serialized, every id in `blockIds` is replaced by the id it maps to, and the
 * result is parsed back. No knowledge of the payload's shape is involved, which is the
 * property that keeps the engine out of the reference system: an id nested under three
 * wrapper layers, sitting in a map key, or escaped inside a string is reached the same way as
 * one on a plain property.
 *
 * **Whole JSON string tokens only.** A block id always occupies a complete JSON string —
 * as a value, or as a key where a map is keyed by identifier — so the pattern anchors on the
 * quotes around it. Without that, an id like `a` would rewrite the `a` inside an unrelated
 * `"reads"`. The quotes are allowed to carry escape backslashes, which is what reaches an id
 * inside a payload that was stringified more than once, and they are put back as found.
 *
 * One pass with a single alternation, not a loop over the entries: replacing id by id would
 * let a substitution rewrite a value some earlier substitution had just produced.
 *
 * An empty map returns the payload untouched, so a caller mapping ids to themselves gets its
 * value back without a serialization round trip.
 */
export function remapRefPayload<T>(payload: T, blockIds: ReadonlyMap<string, string>): T {
  if (blockIds.size === 0) return payload;
  const serialized = JSON.stringify(payload);
  if (serialized === undefined) return payload;
  const rewritten = serialized.replace(
    jsonTokenPattern([...blockIds.keys()]),
    (_match, open: string, id: string, close: string) => `${open}${blockIds.get(id)!}${close}`,
  );
  return rewritten === serialized ? payload : (JSON.parse(rewritten) as T);
}

/**
 * `ids` as whole JSON string tokens, with however many backslashes escape their quotes.
 *
 * `String.raw` so the pattern reads as the regex engine sees it: `\\*` is "any run of literal
 * backslashes", and the run is what makes nesting depth irrelevant — one JSON encoding around
 * the identifier means one backslash before its quotes, two means three, and so on. Written as
 * an ordinary template literal the same pattern needs `\\\\*`, since the string literal eats
 * one level of escaping before the engine sees anything.
 */
function jsonTokenPattern(ids: readonly string[]): RegExp {
  const alternatives = ids.map(escapeForRegExp).join("|");
  return new RegExp(String.raw`(\\*")(${alternatives})(\\*")`, "g");
}

const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Turn template params into live params: every reference payload has its block ids redirected
 * and is then unwrapped, so what comes out is the shape the block projected.
 *
 * Unwrapping here rather than in the block is what lets a kind's params contract stay written
 * in live terms — it never sees a wrapper, in the pre-flight check or at init.
 *
 * @param blockIds template-local entry id → project-local block id. Empty for the pre-flight
 *   check, which runs before any block exists and only needs the params' shape.
 */
export function resolveTemplateRefs<T>(params: T, blockIds: ReadonlyMap<string, string>): T {
  const walk = (node: unknown): unknown => {
    if (isTemplateRef(node)) return remapRefPayload(node.$ref, blockIds);
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node === "object" && node !== null) {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    }
    return node;
  };
  return walk(params) as T;
}

/**
 * Which of `candidates` one entry's params reference.
 *
 * Textual, for the same reason the rewrite is: the engine cannot look inside a payload, so it
 * asks the opposite question — of the entry ids this document defines, which appear in there.
 *
 * Note what this cannot answer: it finds only ids it was given, so a reference to an id the
 * document does NOT define is invisible here. Under the previous shape the engine parsed
 * every identifier and could report that as a dangling reference before an apply began; it
 * can no longer, and the price is that such a reference is discovered when the applied block
 * turns out to be wired to nothing.
 */
export function referencedBlockIds(params: unknown, candidates: Iterable<string>): string[] {
  const ids = [...candidates];
  if (ids.length === 0) return [];

  const payloads: string[] = [];
  const collect = (node: unknown): void => {
    if (isTemplateRef(node)) {
      const serialized = JSON.stringify(node.$ref);
      if (serialized !== undefined) payloads.push(serialized);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (typeof node === "object" && node !== null) Object.values(node).forEach(collect);
  };
  collect(params);

  return ids.filter((id) => payloads.some((payload) => jsonTokenPattern([id]).test(payload)));
}
