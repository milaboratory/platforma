import {
  mapSpecQueryColumns,
  type ColumnUniversalId,
  type SpecQuery,
} from "@milaboratories/pl-model-common";

/**
 * Replace every column leaf whose id equals `fromId` with `toId`, leaving
 * other column refs (linkers, sub-anchors) intact. Wrapper recipes
 * (Overridden / Filtered) and Discovered use this to lift their own id onto
 * the hit leaf, so per-variant uniqueness propagates to the engine and
 * resolver-emitted ids match leaves in the emitted SpecQuery.
 *
 * Generic over all SpecQuery node shapes — including `linkerJoin`, which
 * occurs when a wrapper sits over a {@link ColumnDiscoveredRecipe}: only
 * the deepest hit leaf carries `fromId`, every linker leaf has a different
 * id and is left untouched.
 */
export function rebrandLeafId(
  node: SpecQuery,
  fromId: ColumnUniversalId,
  toId: ColumnUniversalId,
): SpecQuery {
  if (fromId === toId) return node;
  return mapSpecQueryColumns(node, {
    column: (id) => (id === fromId ? toId : id),
  });
}
