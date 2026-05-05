---
"@platforma-sdk/model": minor
---

`createPlDataTableV3`: add `primaryColumns` + `enrichFromPool` for the common case.

The typical block table — "show columns from my workflow output, plus joinable columns from the result pool as optional extras" — now requires three lines instead of fifteen of `ColumnCollectionBuilder` plumbing:

```ts
.outputWithStatus('mainTable', (ctx) =>
  createPlDataTableV3(ctx, {
    tableState: ctx.data.tableState,
    primaryColumns: ctx.outputs?.resolve('mainPf'),
    enrichFromPool: 'optional',
  }),
)
```

`primaryColumns` accepts a `TreeNodeAccessor` (preserves per-column `dataStatus` for partial-data rendering), a `PColumn[]`, or a `TableColumnVariant[]`. `enrichFromPool` accepts `false` (default), `true`, a visibility shorthand (`'optional' | 'hidden' | 'default'`), or a full options object.

Other changes:

- `TableColumnVariant`'s `path`, `qualifications`, `originalId`, and `isPrimary` fields are now optional with sensible defaults (`[]`, `{ forHit: [], forQueries: {} }`, `column.id`, `true`). For the common case only `column` needs to be specified.
- `primaryColumns` and `columns` are mutually exclusive — passing both throws.
- Documentation: `createPlDataTableV3`, all of `createPlDataTableOptionsV3`, `ColumnsSelectorConfig`, `ColumnsDisplayOptions`, `DiscoverTableColumnOptions`, and the internal pipeline now have JSDoc explaining behavior, defaults, and edge cases.

The advanced `columns: { sources, anchors, selector }` form is unchanged. `TooltipableColumn.id` widens from `DiscoveredPColumnId` to `PObjectId | DiscoveredPColumnId` (backward-compatible — `DiscoveredPColumnId` still assignable).
