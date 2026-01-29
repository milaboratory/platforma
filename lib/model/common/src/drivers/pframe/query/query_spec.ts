import type { PObjectId } from '../../../pool';
import type {
  ExprAxisRef,
  ExprColumnRef,
  ExprNumericBinary,
  ExprConstant,
  ExprIsIn,
  ExprLogicalUnary,
  ExprLogicalVariadic,
  ExprStringContains,
  ExprStringContainsFuzzy,
  ExprStringEquals,
  ExprStringRegex,
  ExprNumericUnary,
  QueryAxisSelector,
  QueryColumn,
  QueryColumnSelector,
  QueryCrossJoinColumn,
  QueryFilter,
  QueryInlineColumn,
  QueryJoinEntry,
  QueryOuterJoin,
  QuerySliceAxes,
  QuerySort,
  QuerySortEntry,
  QuerySymmetricJoin,
} from './query_common';
import type { Domain, PColumnIdAndSpec, PColumnSpec, SingleAxisSelector } from '../spec';

/** Column type spec (id + type info, used in QueryData) */
type ColumnIdAndSpec = {
  id: PObjectId;
  spec: PColumnSpec;
};

/** Axis selector (spec layer) */
export type AxisSelectorSpec = QueryAxisSelector<SingleAxisSelector>;

/** Column selector (spec layer) */
export type ColumnSelectorSpec = QueryColumnSelector<PObjectId>;

/** Axis or column selector (spec layer) */
export type SelectorSpec = AxisSelectorSpec | ColumnSelectorSpec;

/** Sort entry (spec layer) */
export type QuerySortEntrySpec = QuerySortEntry<SelectorSpec>;

/** Join entry for spec layer (no mapping) */
export type QueryJoinEntrySpec = QueryJoinEntry<QuerySpec> & {
  qualifications: {
    axis: SingleAxisSelector;
    additionalDomains: Domain;
  }[];
};

/** Column reference */
export type QueryColumnSpec = QueryColumn;

/** Inline column with data */
export type QueryInlineColumnSpec = QueryInlineColumn<ColumnIdAndSpec>;

/** Cross join column */
export type QueryCrossJoinColumnSpec = QueryCrossJoinColumn<PColumnIdAndSpec>;

/** Symmetric join (spec layer) */
export type QuerySymmetricJoinSpec = QuerySymmetricJoin<QueryJoinEntrySpec>;

/** Outer join (spec layer) */
export type QueryOuterJoinSpec = QueryOuterJoin<QueryJoinEntrySpec>;

/** Slice axes operation (spec layer) */
export type QuerySliceAxesSpec = QuerySliceAxes<QuerySpec, SingleAxisSelector>;

/** Sort operation (spec layer) */
export type QuerySortSpec = QuerySort<QuerySpec, QuerySortEntrySpec>;

/** Filter operation (spec layer) */
export type QueryFilterSpec = QueryFilter<QuerySpec, QueryExpressionSpec>;

/** QuerySpec - union of all spec layer query types */
export type QuerySpec =
  | QueryColumnSpec
  | QueryInlineColumnSpec
  | QueryCrossJoinColumnSpec
  | QuerySymmetricJoinSpec
  | QueryOuterJoinSpec
  | QuerySliceAxesSpec
  | QuerySortSpec
  | QueryFilterSpec;

/** Axis reference expression (spec layer) */
export type ExprAxisRefSpec = ExprAxisRef<SingleAxisSelector>;
/** Column reference expression (spec layer) */
export type ExprColumnRefSpec = ExprColumnRef<PObjectId>;

export type QueryExpressionSpec =
  | ExprColumnRefSpec | ExprAxisRefSpec | ExprConstant
  | ExprNumericBinary<QueryExpressionSpec> | ExprNumericUnary<QueryExpressionSpec>
  | ExprStringEquals<QueryExpressionSpec> | ExprStringContains<QueryExpressionSpec> | ExprStringRegex<QueryExpressionSpec> | ExprStringContainsFuzzy<QueryExpressionSpec>
  | ExprLogicalUnary<QueryExpressionSpec> | ExprLogicalVariadic<QueryExpressionSpec>
  | ExprIsIn<QueryExpressionSpec, string> | ExprIsIn<QueryExpressionSpec, number>;
