import type { Branded } from "@milaboratories/helpers";

/**
 * On-wire reference to a block kind, canonically the string `{name}@{version}`.
 *
 * A branded string: readers overwhelmingly need identity equality ("does block
 * X implement kind Y?"), for which an opaque canonical string is ideal. Any
 * reader that needs the parts calls {@link parseKindRef}; any writer composes
 * the reference through {@link formatKindRef}. Keeping composition in a single
 * function localizes the one open decision — whether the name segment has to be
 * org-qualified for global uniqueness — to one place.
 */
export type BlockKindReference = Branded<string, "BlockKindReference">;

/**
 * Compose a {@link BlockKindReference} from a kind's `name`/`version`.
 *
 * The single place that decides how the reference is assembled. If global
 * uniqueness later requires the name segment to be org-qualified, this is the
 * one line that changes.
 */
export const formatKindRef = (k: { name: string; version: string }): BlockKindReference =>
  `${k.name}@${k.version}` as BlockKindReference;

/**
 * Split a `{name}@{version}` string on its version separator.
 *
 * The one place that decides where the name ends. Uses the LAST `@` so an
 * org-qualified npm name that itself starts with `@` (e.g.
 * `@platforma-open/pkg.kind`) keeps its whole name. A leading/absent separator
 * (`lastIndexOf("@") <= 0`) means the string carries no version segment —
 * malformed — so this throws rather than returning a silently version-less
 * result.
 *
 * Shared with the template layer, whose `{name}@{selector}` references use the
 * same split and differ only in how the right half is interpreted (see
 * `parseKindSelectorReference`). `what` names the thing being parsed so the
 * error message stays specific to the caller's reference type.
 */
export const splitVersionedName = (
  ref: string,
  what = "block kind reference",
  expected = "{name}@{version}",
): { name: string; version: string } => {
  const at = ref.lastIndexOf("@");
  if (at <= 0) {
    throw new Error(`Malformed ${what} (expected '${expected}'): ${ref}`);
  }
  return { name: ref.slice(0, at), version: ref.slice(at + 1) };
};

/**
 * Split a {@link BlockKindReference} back into `{ name, version }`.
 *
 * Throws on a reference with no version segment — see
 * {@link splitVersionedName}, which owns the split rule.
 */
export const parseKindRef = (ref: BlockKindReference): { name: string; version: string } =>
  splitVersionedName(ref);
