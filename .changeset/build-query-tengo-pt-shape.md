---
"@platforma-sdk/workflow-tengo": minor
"@platforma-open/milaboratories.software-ptabler.schema": minor
"@platforma-open/milaboratories.software-ptabler": minor
"@milaboratories/pl-model-common": patch
---

Migrate `pt` emitters and ptabler `read_frame` step to the `SpecQuery` shape, and fix a TS type bug.

**`pl-model-common` type fix:** `QuerySliceAxes.axisFilters[i].axisSelector` was typed as `QueryAxisSelector<A>` (wrapped `{type: "axis", id: A}`), which disagreed with the wire format — Rust (`pframes-rs/packages/bridge/src/query/query_slice_axes.rs`) and Python (`polars_pf.json.query_spec.SpecQuerySliceAxisFilter`) both serialize `axis_selector` as the bare selector (`SingleAxisSelector` at the spec layer, `number` at the data layer). The Rust `serialize_slice_axes` test at `pframes-rs/packages/spec/src/query_spec/query.rs:381` confirms the flat wire. Updated `QuerySliceAxes<Q, A>` to take `A` unconstrained, updated `SpecQuerySliceAxes` to use `SingleAxisSelector` directly and `DataQuerySliceAxes` to use `number` directly, and corrected the jsdoc example.

- `pt.p.column/slicedColumn/inner/full/outer` now emit `SpecQueryJoinEntry` nodes (`column`, `sliceAxes`, `innerJoin`, `fullJoin`, `outerJoin`) byte-compatible with the output of `PFrameSpecDriver.buildQuery`.
- Added `pt.p.linkerJoin` for emitter completeness against the `SpecQuery` union.
- `read_frame.request` is now `PTableDefV2<PObjectId>` (`{ query: SpecQuery }`) — dropped the legacy `{ src, filters: [] }` sibling shape. The `filters` list goes away because filters live as `SpecQueryFilter` nodes inside the query tree.
- ptabler Python step (`ptabler.steps.read_frame.ReadFrame`) takes `PTableDefV2` and forwards `request.query` directly to `polars_pf.pframe_source`, which accepts `SpecQuery` natively.
- Bumped `polars-pf` requirement to `1.1.27` (shipped in `runenv-python-3.12.10@1.3.9`; catalog `runenv-python-3` bumped `1.7.4 → 1.8.0` to pull it in). Updated the `test_duplicate_axis_values_failure` assertion to match the new error wording ("multiple rows with the same axis key").
- `slicedColumn` no longer uses the `new_id`/`column_id` rename pair — each slice wraps a direct `Column(name)` reference under a `sliceAxes` node with axis selectors resolved from the column's `axesSpec`. This aligns with the Rust upgrade rule that rejects `new_id != column_id` (see `pframes-rs/packages/spec/src/requests/query_upgrade/logic.rs:35`).
