---
"@milaboratories/pl-model-common": minor
---

`pframe/query` types now mirror the pframes-rs wire format.

New variants on `SpecQuery` / `DataQuery`:

- `transformColumns` query node (`QueryTransformColumns`); the mode
  is `"append" | "replace"` (the runtime accepts the legacy `"add"`
  as a serde alias).
- `cast`, `conditional` expressions.
- `ranking` window function (with `RankingKind`).

`isInPolygon`, `aggregation` (`AggregationKind`), and `cumulative`
(`CumulativeOperand`) are present in the Rust query model but their
DataFusion executors return errors today (filter.rs:276 / 340 / 387).
The TS definitions are committed but commented out in `query_common.ts`
so block authors can't construct a query the runtime won't execute.
Re-enable in lock-step with the Rust wiring.

Wire-shape fixes:

- `ExprIfNull` is now `ExprFillNull`, tag `"fillNull"` (the runtime
  accepts `"ifNull"` as a serde alias).
- `NumericBinaryOperand` gains `"power"`.
- `Point2D` is now an `[x, y]` tuple, matching the Rust serialisation
  (previously typed as `{ x, y }`).
- `ExprIsIn.negate` is now required `boolean` (previously optional).
  The Rust runtime keeps a tolerant deserialiser that defaults a
  missing `negate` to `false` and always re-emits the field; new
  callers should pass it explicitly.
- `QuerySort.sortBy[].nullsFirst` is plain `boolean` (was
  `null | boolean`).
- `QuerySparseToDenseColumn`: field renamed `axesIndices → axes` and
  parameterised over the layer's axis-selector type; at the spec layer
  entries are named `SingleAxisSelector`s, at the data layer they are
  numeric indices. Old wire field name still parses via a serde alias.

One downstream consumer in `@platforma-sdk/model`
(`filters/converters/filterToQuery.ts`) updated to pass `negate`
explicitly on the `inSet` / `notInSet` paths and to migrate from
`ifNull` to `fillNull`.
