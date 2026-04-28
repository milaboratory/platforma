import type { PObjectId } from "../../../pool";
import type {
  ExprAxisRef,
  ExprColumnRef,
  ExprNumericBinary,
  ExprNumericComparison,
  ExprConstant,
  ExprIsIn,
  ExprIsNull,
  ExprIfNull,
  ExprLogicalUnary,
  ExprLogicalVariadic,
  ExprStringContains,
  ExprStringContainsFuzzy,
  ExprStringEquals,
  ExprStringRegex,
  ExprNumericUnary,
  QueryColumn,
  QuerySparseToDenseColumn,
  QueryFilter,
  QueryInlineColumn,
  QueryJoinEntry,
  QueryLinkerJoin,
  QueryOuterJoin,
  QuerySliceAxes,
  QuerySort,
  QuerySymmetricJoin,
  InferBooleanExpressionUnion,
} from "./query_common";
import type { Domain, PColumnIdAndSpec, SingleAxisSelector } from "../spec";

/**
 * Join entry for spec-layer queries — the base join entry extended with
 * per-axis domain constraints. Absent `qualifications` is equivalent to `[]`.
 *
 * @example
 * {
 *   entry: querySpec,
 *   qualifications: [{ axis: { name: 'sample' }, contextDomain: { ... } }]
 * }
 */
export type SpecQueryJoinEntry<C = PObjectId> = QueryJoinEntry<SpecQuery<C>> & {
  qualifications?: {
    /** Axis to qualify. */
    axis: SingleAxisSelector;
    /** Additional domain constraints for this axis. */
    contextDomain: Domain;
  }[];
};

/** @see QueryColumn */
export type SpecQueryColumn<C = PObjectId> = QueryColumn<C>;
/** @see QueryInlineColumn */
export type SpecQueryInlineColumn = QueryInlineColumn<PColumnIdAndSpec>;
/** @see QuerySparseToDenseColumn */
export type SpecQuerySparseToDenseColumn<C = PObjectId> = QuerySparseToDenseColumn<
  C,
  PColumnIdAndSpec
>;
/** @see QuerySymmetricJoin */
export type SpecQuerySymmetricJoin<C = PObjectId> = QuerySymmetricJoin<SpecQueryJoinEntry<C>>;
/** @see QueryOuterJoin */
export type SpecQueryOuterJoin<C = PObjectId> = QueryOuterJoin<SpecQueryJoinEntry<C>>;
/**
 * Linker side of a spec-layer linker-join.
 *
 * At the spec layer the linker is just a column reference — integration artifacts
 * (axes mapping, one-side indices) are derived during spec→data conversion.
 */
export type SpecQueryLinkerJoinLinker<C = PObjectId> = {
  /** Linker column reference. */
  column: C;
};
/** @see QueryLinkerJoin */
export type SpecQueryLinkerJoin<C = PObjectId> = QueryLinkerJoin<
  SpecQueryLinkerJoinLinker<C>,
  SpecQueryJoinEntry<C>
>;
/** @see QuerySliceAxes */
export type SpecQuerySliceAxes<C = PObjectId> = QuerySliceAxes<SpecQuery<C>, SingleAxisSelector>;
/** @see QuerySort */
export type SpecQuerySort<C = PObjectId> = QuerySort<SpecQuery<C>, SpecQueryExpression>;
/** @see QueryFilter */
export type SpecQueryFilter<C = PObjectId> = QueryFilter<SpecQuery<C>, SpecQueryBooleanExpression>;

/**
 * Union of all spec layer query types.
 *
 * The spec layer operates with named selectors and column IDs,
 * making it suitable for user-facing query construction and validation.
 *
 * @template C - Column reference type. Defaults to PObjectId (ID-only).
 *   Can be parameterized with richer types (e.g., PColumn<Data>) to carry
 *   full column data directly in the query tree.
 *
 * Includes:
 * - Leaf nodes: column, inlineColumn, sparseToDenseColumn
 * - Join operations: innerJoin, fullJoin, outerJoin
 * - Transformations: sliceAxes, sort, filter
 */
export type SpecQuery<C = PObjectId> =
  | SpecQueryColumn<C>
  | SpecQueryInlineColumn
  | SpecQuerySparseToDenseColumn<C>
  | SpecQuerySymmetricJoin<C>
  | SpecQueryOuterJoin<C>
  | SpecQueryLinkerJoin<C>
  | SpecQuerySliceAxes<C>
  | SpecQuerySort<C>
  | SpecQueryFilter<C>;

/** @see ExprAxisRef */
export type SpecExprAxisRef = ExprAxisRef<SingleAxisSelector>;
/** @see ExprColumnRef */
export type SpecExprColumnRef = ExprColumnRef<PObjectId>;

export type SpecQueryExpression =
  | SpecExprColumnRef
  | SpecExprAxisRef
  | ExprConstant
  | ExprNumericBinary<SpecQueryExpression>
  | ExprNumericComparison<SpecQueryExpression>
  | ExprNumericUnary<SpecQueryExpression>
  | ExprStringEquals<SpecQueryExpression>
  | ExprStringContains<SpecQueryExpression>
  | ExprStringRegex<SpecQueryExpression>
  | ExprStringContainsFuzzy<SpecQueryExpression>
  | ExprIsNull<SpecQueryExpression>
  | ExprIfNull<SpecQueryExpression>
  | ExprLogicalUnary<SpecQueryExpression>
  | ExprLogicalVariadic<SpecQueryExpression>
  | ExprIsIn<SpecQueryExpression, string>
  | ExprIsIn<SpecQueryExpression, number>;

export type SpecQueryBooleanExpression = InferBooleanExpressionUnion<SpecQueryExpression>;
