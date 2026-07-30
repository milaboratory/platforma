---
"@platforma-sdk/model": minor
---

Name the column predicates after what a caller can do, not after the recipe classes

`isLeafColumn` and `isColumnLazy` answered two different questions ("does this
column need other columns to resolve?" and "can I read its data?") under names
that suggested a third one, so picking the right guard meant reading the
implementation. Three call sites out of four in the first consumer block picked
the wrong one.

- `hasReachableData(recipe)` — new. Narrows to `DataColumn`, the interface that
  exposes `getData()`. True for a bare leaf and for a spec-override over one:
  the only shapes whose data still matches their spec.
- `isSelfContained(recipe)` — new. Whether the column resolves without pulling
  in other columns. Replaces `isLeafColumn`, same semantics.
- `ColumnLazy` → `DataColumn`, `ColumnLazyImpl` → `DataColumnImpl`,
  `ColumnLazyId` / `ColumnLazyData` → `DataColumnId` / `ColumnData`.
  Deprecated aliases keep existing imports compiling.
- A spec override over a leaf is now readable too: `ColumnOverriddenRecipe.wrap`
  picks a data-bearing variant when the wrapped recipe carries data, so
  `getData()` exists exactly where it can be called and there is no throwing
  path behind the guard. The choice is structural — it follows from the id — so
  the same id always yields the same class whether it came from `withSpecs` or
  from parsing a string.
- `isColumnLazy` is deprecated. Its one remaining use is a legacy slot typed
  `PObjectId` (`PColumn.id`, `PColumnIdAndSpec.columnId`).
- `getLeafColumnData` is deprecated **and behaves differently**: it used to walk
  past an axis-filtered layer and return the underlying leaf's *unsliced* data,
  which does not match the recipe's spec. It now returns `undefined` for
  anything `hasReachableData` rejects.
