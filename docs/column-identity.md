# Column identity: physical vs logical

This document defines the conventions for column identifiers across the SDK
and the host (`pl-middle-layer`). Two distinct identities are involved in a
table-rendering pipeline; mixing them up causes engine-level "column not
found" errors and silent variant deduplication.

## The two identities

### Physical identity — `PObjectId`

A bare `PObjectId` (`LocalPObjectId | GlobalPObjectId`) names exactly one
**stored** column in the result pool. It is the key the host column
registry resolves against.

Use it (and only it) at these boundaries:

- Column registry lookup on the host (`resolvePColumnById` in
  `lib/node/pl-middle-layer/src/js_render/column_registry.ts`).
- The id list passed to `ctx.createPFrame([...ids])` — PFrame is the
  physical column registry, one entry per bare id, so duplicates must be
  collapsed (use `extractPObjectId` + dedupe).
- Spec frame keys passed to `pframeSpec.createSpecFrame({...})` when
  evaluating queries over already-resolved physical specs.

### Logical identity — `ColumnUniversalId`

`ColumnUniversalId` is the union of bare ids and rich wrapper ids
serialized as canonical JSON:

- `LocalPObjectId` / `GlobalPObjectId` — bare physical id.
- `ColumnFilteredId` — `{source, axisFilters}`.
- `ColumnDiscoveredId` — `{column, path, qualifications}`.
- `ColumnOverridedId` — `{source, specOverrides}`.

Definitions: `lib/model/common/src/drivers/pframe/spec/ids.ts`.

A logical id describes a contextualised view of a physical column: which
linker chain you reached it through, which axes are sliced, which spec
overrides are applied. Two `ColumnDiscoveredId`s sharing the same
`column` but with different `path` are *different* logical columns even
though they point to the same stored data.

Use it (and only it) everywhere else:

- `ColumnRecipe.id` (`sdk/model/src/columns/column_recipes/types.ts`).
- The `column` field of every `SpecQuery` leaf (`{type: "column", column: <id>}`).
- `PTableColumnId.id` in filter and sorting references — UI gets these
  from the recipe and ships them back unchanged.
- `derivedLabels` / `hiddenColumnIds` keys: variants of the same physical
  column have independent labels and independent hide/show state.

### Crossing the boundary: `extractPObjectId`

`extractPObjectId(id: ColumnUniversalId): PObjectId`
(`lib/model/common/src/drivers/pframe/spec/ids.ts:97`) is the **only**
sanctioned way to drop from a logical id to its physical counterpart. It
walks wrapper layers (`isColumnFilteredKey` → `source`,
`isColumnOverridedKey` → `source`, `isColumnDiscoveredKey` → `column`)
until it reaches a bare `PObjectId`.

Call it only at the boundary points listed above. Recipe internals and
SpecQuery construction must never strip down to bare ids early.

## Recipe contract

Every concrete `ColumnRecipe` must satisfy:

1. `recipe.id` is its full logical id (`ColumnUniversalId`).
2. `recipe.getQuery()` returns a `SpecQuery` whose terminal column leaf
   carries `recipe.id` — not the inner recipe's id, not the bare id.

For leaf recipes (`ColumnLazyImpl`) this is trivial: `id` is the bare
`PObjectId` and the query is `{type: "column", column: id}`.

For wrapper recipes (Overrided / Filtered / Discovered) the inner recipe
already produced a query whose leaf carries the **inner's** id. The
wrapper must lift its own id onto that leaf while preserving everything
else (linker chains, sliceAxes, specOverride wrappers). Use the shared
helper:

```ts
import { rebrandLeafId } from "./leaf_rebrand";

// inside Wrapper.getQuery():
const wrapped = wrapWith(rebrandLeafId(this.inner.getQuery(), this.inner.id, this.id));
```

`rebrandLeafId(node, fromId, toId)`
(`sdk/model/src/columns/column_recipes/leaf_rebrand.ts`) walks the full
`SpecQuery` tree via `mapSpecQueryColumns` and renames only those column
leaves whose id equals `fromId`. Linker leaves and unrelated refs are
left untouched. This is the only correct way to compose wrapper queries.

## SpecQuery generics

The default leaf type of `SpecQuery<C>` was widened from `PObjectId` to
`ColumnUniversalId`
(`lib/model/common/src/drivers/pframe/query/query_spec.ts`). The same
default propagates to `SpecQueryColumn`, `SpecQueryJoinEntry`,
`SpecQueryLinkerJoin`, `SpecExprColumnRef`, `PTableColumnSpecColumn.id`,
`PTableColumnIdColumn.id`, `QueryColumnIdColumn.id`. Existing call sites
that pin `<PObjectId>` keep their narrow contract; everything else
widens to accept rich ids.

This makes the type system match the runtime: leaves and table-column
ids genuinely carry logical ids, and we no longer need to cast.

## Why per-variant uniqueness matters

`pframe-engine` deduplicates output columns by their leaf id. If two
`ColumnDiscoveredRecipe` instances reach the same physical hit through
different linker chains and both emit `{column: <bare hit id>}` at the
leaf, the engine sees one column and the second variant disappears
silently. With every recipe lifting its own id to the leaf, the engine
sees two distinct leaves and produces two output columns — which is what
the table is asking for.

The same logic applies to wrappers used as filter / sort targets: the
resolver returns `recipe.id` (logical), so the engine must find a column
with that logical id in the integrated table. Lifting wrapper ids onto
the leaves is what makes that lookup succeed.

## Where these rules live in code

- Type definitions: `lib/model/common/src/drivers/pframe/spec/ids.ts`,
  `lib/model/common/src/drivers/pframe/query/query_spec.ts`,
  `lib/model/common/src/drivers/pframe/table_common.ts`.
- Recipe implementations:
  `sdk/model/src/columns/column_lazy.ts`,
  `sdk/model/src/columns/column_recipes/column_overrided_recipe.ts`,
  `sdk/model/src/columns/column_recipes/column_filtered_recipe.ts`,
  `sdk/model/src/columns/column_recipes/column_discovered_recipe.ts`,
  `sdk/model/src/columns/column_recipes/leaf_rebrand.ts`.
- Linker collection (logical→physical at the boundary):
  `sdk/model/src/columns/utils.ts` (`collectLinkerIds`,
  `collectLinkerColumns`).
- Resolver (filters/sorting): `sdk/model/src/components/PlDataTable/columnResolver.ts`.
- Table assembly: `sdk/model/src/components/PlDataTable/createPlDataTable/createPlDataTableV3.ts`
  (notice `createPFrame(uniq([...].map(extractPObjectId)))`).
- Host-side physical resolver: `lib/node/pl-middle-layer/src/js_render/column_registry.ts`.
