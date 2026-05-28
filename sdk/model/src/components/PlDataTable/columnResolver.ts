import type {
  AxisId,
  CanonicalizedJson,
  ColumnUniversalId,
  PObjectId,
  PTableColumnId,
  PTableColumnIdColumn,
} from "@milaboratories/pl-model-common";
import { canonicalizeJson, extractPObjectId, getAxisId } from "@milaboratories/pl-model-common";
import type { ColumnRecipe } from "../../columns";

/**
 * Resolves a user-supplied PTableColumnId against the discovered set of
 * columns and axes. For column refs, accepts either the full recipe id (rich
 * {@link ColumnUniversalId}) or the bare {@link PObjectId} and returns a ref
 * carrying the recipe's full id — the same id that appears as the leaf in the
 * emitted SpecQuery, so engine-side dedup is consistent with the resolver's
 * view. Axis refs are checked against the union of axes spanned by the
 * columns and pass through unchanged on hit.
 * Returns `undefined` when the reference cannot be matched.
 */
export type ColumnResolver = (ref: PTableColumnId) => PTableColumnId | undefined;

export function createColumnResolver(
  columns: ColumnRecipe[],
  deps?: { warn?: (msg: string) => void },
): ColumnResolver {
  const axisSet = new Set<CanonicalizedJson<AxisId>>();
  for (const c of columns) {
    for (const ax of c.getSpec().axesSpec) {
      axisSet.add(canonicalizeJson<AxisId>(getAxisId(ax)));
    }
  }

  const byFullId = new Map<ColumnUniversalId, ColumnRecipe>();
  const byPObjectId = new Map<PObjectId, ColumnRecipe>();
  for (const c of columns) {
    byFullId.set(c.id, c);
    const pid = extractPObjectId(c.id);
    const existing = byPObjectId.get(pid);
    if (existing === undefined) {
      byPObjectId.set(pid, c);
    } else if (existing.id !== c.id) {
      deps?.warn?.(
        `Ambiguous PObjectId ${pid}: recipe ids ${existing.id} and ${c.id} both match — keeping first.`,
      );
    }
  }

  return (ref: PTableColumnId): PTableColumnId | undefined => {
    if (ref.type === "axis") {
      const key = canonicalizeJson<AxisId>(ref.id);
      return axisSet.has(key) ? ref : undefined;
    }
    const hit = byFullId.get(ref.id) ?? byPObjectId.get(extractPObjectId(ref.id));
    if (hit === undefined) return undefined;
    return { type: "column", id: hit.id } satisfies PTableColumnIdColumn;
  };
}
