import type { PColumnSpec } from "../drivers/pframe/spec/spec";
import type { NativePObjectId } from "../drivers/pframe/spec/native_id";
import { deriveNativeId } from "../drivers/pframe/spec/native_id";
import type { ColumnUniversalId } from "../drivers/pframe/spec/ids";
import { isPObjectId } from "../pool";

/**
 * Two-track dedup over an item stream keyed by `ColumnUniversalId`:
 *
 * - **Raw `PObjectId`s** are deduped by `deriveNativeId(spec)`. The same
 *   physical column reached via outputs vs. result_pool has different
 *   id shapes but identical nativeId — first occurrence wins so the
 *   provider order (outputs before pool) decides which id is canonical.
 * - **Non-`PObjectId` ids** (e.g. `SUniversalPColumnUniversalId`,
 *   `ColumnDiscoveredId`) keep raw-id dedup — they legitimately share
 *   nativeId with siblings.
 *
 * When `getSpec` returns `undefined` for a `PObjectId`, falls back to raw-id
 * dedup (so an unresolvable id still survives instead of dropping silently).
 *
 * Shared by sandbox-side `extractColumns` (column_providers) and host-side
 * `ColumnsCollectionDriverImpl.getColumns` — both layers need identical
 * dedup semantics, but operate on different concrete item types (ColumnLazy
 * vs. raw ColumnUniversalId).
 */
export function dedupColumns<T>(
  items: ReadonlyArray<T>,
  getId: (item: T) => ColumnUniversalId,
  getSpec: (item: T) => PColumnSpec | undefined,
): T[] {
  const seenNative = new Set<NativePObjectId>();
  const seenId = new Set<ColumnUniversalId>();
  const out: T[] = [];
  for (const item of items) {
    const id = getId(item);
    if (seenId.has(id)) continue;
    if (isPObjectId(id)) {
      const spec = getSpec(item);
      if (spec !== undefined) {
        const nativeId = deriveNativeId(spec);
        if (seenNative.has(nativeId)) continue;
        seenNative.add(nativeId);
      }
    }
    seenId.add(id);
    out.push(item);
  }
  return out;
}
