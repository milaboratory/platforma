import { isColumnUniversalKey, remapColumnIdBlockIds } from "../drivers";

/**
 * Point every column identifier in a block's params at the blocks of the project being built.
 *
 * The whole of what a template does about references, and it lives here — in the package the
 * block's own bundle imports — because knowing which values carry block ids is knowing the
 * reference system. The engine carrying the params neither marks them, reads them, nor
 * rewrites them: it hands the block its params and this map, and takes back what comes out.
 *
 * Params travel verbatim precisely so that this is possible. A file holds a `PlRef` as the
 * object the block stored and a column id as the canonical string the block stored, with no
 * marker of any kind, and the identifiers are found here by recognizing them — the same way
 * the project's own dependency detector finds them in live args.
 *
 * Rewriting is structural, never textual: an identifier is taken apart, its `blockId` fields
 * are replaced, and it is rebuilt canonically. That is what keeps a value that merely *looks*
 * like an id — a `domain` entry, an axis filter — from being rewritten along with it, and
 * what re-sorts a qualifications map whose keys are identifiers.
 *
 * An id the map does not mention is left as it is. That is the ordering rule doing its work:
 * a caller building the map as it creates blocks passes only the entries already created, so
 * a reference to an entry further down the file stays pointing at a block that does not
 * exist, and the applied block reports itself as missing references rather than being wired
 * to something below it.
 *
 * @param params Whatever the block projected, as the document stored it
 * @param blockIds template-local entry id → the block id that entry was given
 */
export function relocateBlockIds<T>(params: T, blockIds: ReadonlyMap<string, string>): T {
  if (blockIds.size === 0) return params;
  const remapBlockId = (blockId: string) => blockIds.get(blockId) ?? blockId;

  const walk = (node: unknown): unknown => {
    // Any string may be an identifier under any amount of escaping; one that is not comes
    // back as the very same string, so this needs no test of its own here.
    if (typeof node === "string") return remapColumnIdBlockIds(node, remapBlockId);

    // Before the generic object case: an identifier IS an object, and descending into one
    // would rewrite the strings nested in it piecemeal instead of rebuilding the whole id —
    // losing the bottom-up canonicalization that keeps the result a valid identifier.
    if (isColumnUniversalKey(node)) return remapColumnIdBlockIds(node, remapBlockId);

    if (Array.isArray(node)) return node.map(walk);

    if (typeof node === "object" && node !== null) {
      // Keys as well as values: params may be keyed by column id — per-column settings, say
      // — and a key is exactly as much of a reference as a value is.
      return Object.fromEntries(
        Object.entries(node).map(([key, value]) => [
          remapColumnIdBlockIds(key, remapBlockId),
          walk(value),
        ]),
      );
    }

    return node;
  };

  return walk(params) as T;
}
