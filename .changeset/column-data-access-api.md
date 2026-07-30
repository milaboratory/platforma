---
"@platforma-sdk/model": minor
---

Name the column predicates after what a caller can do, not after the recipe classes

`isLeafColumn` and `isColumnLazy` answered two different questions ("does this
column need other columns to resolve?" and "can I read its data?") under names
that suggested a third one, so picking the right guard meant reading the
implementation. Three call sites out of four in the first consumer block picked
the wrong one.

- `hasDirectData(recipe)` — new. Narrows to `DataColumn`, the interface that
  exposes `getData()`. True for a bare leaf and for a spec-override over one:
  the only shapes whose data still matches their spec.
- `isSelfContained(recipe)` — new. Whether the column resolves without pulling
  in other columns. Replaces `isLeafColumn`, same semantics.
- `ColumnLazy` → `DataColumn`, `ColumnLazyImpl` → `DataColumnImpl`,
  `ColumnLazyId` / `ColumnLazyData` → `DataColumnId` / `DataColumnData`.
  Deprecated aliases keep existing imports compiling.
- `ColumnOverriddenRecipe` now implements `getData()`, delegating to its inner
  leaf — spec overrides never reshape data.
- `isColumnLazy` is deprecated. Its one remaining use is a legacy slot typed
  `PObjectId` (`PColumn.id`, `PColumnIdAndSpec.columnId`).
- `getLeafColumnData` is deprecated **and behaves differently**: it used to walk
  past an axis-filtered layer and return the underlying leaf's *unsliced* data,
  which does not match the recipe's spec. It now returns `undefined` for
  anything `hasDirectData` rejects.
