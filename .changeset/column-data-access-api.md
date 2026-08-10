---
"@platforma-sdk/model": minor
---

Name the column predicates after what a caller can do, not after the recipe classes

`isLeafColumn` and `isColumnLazy` answered two different questions ("does this
column need other columns to resolve?" and "can I read its data?") under names
that suggested a third one, so picking the right guard meant reading the
implementation. Three call sites out of four in the first consumer block picked
the wrong one.

New predicates:

- `hasReachableData(recipe)` — narrows to `DataColumnRecipe`, the interface that
  exposes `getData()`. True for a bare leaf and for a spec override over one:
  the only shapes whose data still matches their spec.
- `hasSingleDataColumn(recipe)` — whether the column resolves without pulling in
  other columns, i.e. depends on exactly one storage column. Replaces
  `isLeafColumn`.
- `isDataColumn(value)` — whether the value is a bare leaf, whose `id` is a
  `PObjectId` naming a real storage column. Use it only where a type forces that
  id shape (`PColumn.id`, `PColumnIdAndSpec.columnId`).

A spec override over a leaf is now readable: `ColumnOverriddenRecipe.wrap` picks
a data-bearing variant when the wrapped recipe carries data, so `getData()`
exists exactly where it can be called and there is no throwing path behind the
guard. The choice is structural — it follows from the id — so the same id always
yields the same class whether it came from `withSpecs` or from parsing a string.

**Breaking renames.** `ColumnLazy` → `DataColumn` (the factory) plus
`DataColumnRecipe` (the interface), `ColumnLazyImpl` → `DataColumnImpl`,
`ColumnLazyId` → `DataColumnId`, `ColumnLazyData` → `ColumnData`.

**Removed.**

- `isColumnLazy` → `isDataColumn` (same check, contract-shaped name).
- `getLeafColumnData` — it walked past an axis-filtered layer and returned the
  underlying leaf's *unsliced* data, inconsistent with the recipe's spec;
  replace with `hasReachableData(c) ? c.getData() : undefined`.
- `isColumnRecipe` → `isColumn`.
- The `ColumnLazy*` names above are gone rather than aliased.

`isLeafColumn` remains as a deprecated alias of `hasSingleDataColumn`.
