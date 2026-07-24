import type { Branded } from "@milaboratories/helpers";

/**
 * On-wire reference to a block kind, canonically the string `{name}@{version}`.
 *
 * A branded string: readers overwhelmingly need identity equality ("does block
 * X implement kind Y?"), for which an opaque canonical string is ideal. Any
 * reader that needs the parts calls {@link parseKindRef}; any writer composes
 * the reference through {@link formatKindRef}. Keeping composition in a single
 * function localizes the one open decision — whether the name segment is
 * org-qualified (see Q-0005) — to one place.
 */
export type BlockKindReference = Branded<string, "BlockKindReference">;

/**
 * Compose a {@link BlockKindReference} from a kind's `name`/`version`.
 *
 * The single place that decides how the reference is assembled. If global
 * uniqueness later requires the name segment to be org-qualified, this is the
 * one line that changes (Q-0005).
 */
export const formatKindRef = (k: { name: string; version: string }): BlockKindReference =>
  `${k.name}@${k.version}` as BlockKindReference;

/**
 * Split a {@link BlockKindReference} back into `{ name, version }`.
 *
 * Uses the LAST `@` so an org-qualified npm name that itself starts with `@`
 * (e.g. `@platforma-open/pkg.kind`) keeps its whole name. A leading/absent
 * separator (`lastIndexOf("@") <= 0`) means the reference carries no version
 * segment — a malformed reference — so this throws rather than returning a
 * silently version-less result.
 */
export const parseKindRef = (ref: BlockKindReference): { name: string; version: string } => {
  const at = ref.lastIndexOf("@");
  if (at <= 0) {
    throw new Error(`Malformed block kind reference (expected '{name}@{version}'): ${ref}`);
  }
  return { name: ref.slice(0, at), version: ref.slice(at + 1) };
};
