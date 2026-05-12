---
"@milaboratories/pl-model-common": minor
---

`pframe/query` types now mirror the pframes-rs wire format.

New variants on `SpecQuery` / `DataQuery`:

- `transformColumns` query node (`QueryTransformColumns`); the mode
  is `"append" | "replace"` (the runtime accepts the legacy `"add"`
  as a serde alias).
- `cast`, `conditional`, `isInPolygon` expressions.
- `aggregation` (with the flat-string `AggregationKind`), `ranking`
  (`RankingKind`), `cumulative` (`CumulativeOperand`).

Wire-shape fixes:

- `ExprIfNull` is now `ExprFillNull`, tag `"fillNull"` (the runtime
  accepts `"ifNull"` as a serde alias).
- `NumericBinaryOperand` gains `"power"`.
- `Point2D` is now an `[x, y]` tuple, matching the Rust serialisation
  (previously typed as `{ x, y }`).
- `ExprIsIn.negate` and `ExprIsInPolygon.negate` are required `boolean`
  (previously optional). For `isIn` the Rust runtime keeps a tolerant
  deserialiser that defaults a missing `negate` to `false`, then
  always re-emits the field; new callers should pass it explicitly.
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
