import { assertNever } from "@milaboratories/pl-model-common";
import {
  and,
  col,
  lit,
  or,
  rank,
  type Expression,
  type ExpressionImpl,
} from "@milaboratories/ptabler-expression-js";
import type { FilterSpec } from "../types";

export function convertFilterUiToExpressionImpl(value: FilterSpec): ExpressionImpl {
  if (value.type === "or") {
    const expressions = value.filters
      .filter((f) => f.type !== undefined)
      .map(convertFilterUiToExpressionImpl);
    if (expressions.length === 0) {
      throw new Error("OR filter requires at least one operand");
    }
    return or(...expressions);
  }

  if (value.type === "and") {
    const expressions = value.filters
      .filter((f) => f.type !== undefined)
      .map(convertFilterUiToExpressionImpl);
    if (expressions.length === 0) {
      throw new Error("AND filter requires at least one operand");
    }
    return and(...expressions);
  }

  if (value.type === "not") {
    return convertFilterUiToExpressionImpl(value.filter).not();
  }

  if (value.type === "isNA") {
    return col(value.column).isNull();
  }

  if (value.type === "isNotNA") {
    return col(value.column).isNotNull();
  }

  if (value.type === "patternEquals") {
    return col(value.column).eq(lit(value.value));
  }

  if (value.type === "patternNotEquals") {
    return col(value.column).neq(lit(value.value));
  }

  if (value.type === "patternContainSubsequence") {
    return col(value.column).strContains(value.value, false, true);
  }

  if (value.type === "patternNotContainSubsequence") {
    return col(value.column).strContains(value.value, false, true).not();
  }

  if (value.type === "equal") {
    return col(value.column).eq(lit(value.x));
  }

  if (value.type === "notEqual") {
    return col(value.column).neq(lit(value.x));
  }

  if (value.type === "lessThan") {
    return col(value.column).lt(lit(value.x));
  }

  if (value.type === "greaterThan") {
    return col(value.column).gt(lit(value.x));
  }

  if (value.type === "lessThanOrEqual") {
    return col(value.column).le(lit(value.x));
  }

  if (value.type === "greaterThanOrEqual") {
    return col(value.column).ge(lit(value.x));
  }

  if (value.type === "equalToColumn") {
    return col(value.column).eq(col(value.rhs));
  }

  if (value.type === "greaterThanColumn") {
    if (value.minDiff !== undefined && value.minDiff !== 0) {
      return col(value.column).plus(lit(value.minDiff)).gt(col(value.rhs));
    }
    return col(value.column).gt(col(value.rhs));
  }

  if (value.type === "lessThanColumn") {
    if (value.minDiff !== undefined && value.minDiff !== 0) {
      return col(value.column).plus(lit(value.minDiff)).lt(col(value.rhs));
    }
    return col(value.column).lt(col(value.rhs));
  }

  if (value.type === "greaterThanColumnOrEqual") {
    if (value.minDiff !== undefined && value.minDiff !== 0) {
      return col(value.column).plus(lit(value.minDiff)).ge(col(value.rhs));
    }
    return col(value.column).ge(col(value.rhs));
  }

  if (value.type === "lessThanColumnOrEqual") {
    if (value.minDiff !== undefined && value.minDiff !== 0) {
      return col(value.column).plus(lit(value.minDiff)).le(col(value.rhs));
    }
    return col(value.column).le(col(value.rhs));
  }

  if (value.type === "topN") {
    return rank(col(value.column), true).over([]).le(lit(value.n));
  }

  if (value.type === "bottomN") {
    return rank(col(value.column), false).over([]).le(lit(value.n));
  }

  if (
    value.type === "patternMatchesRegularExpression" ||
    value.type === "patternFuzzyContainSubsequence" ||
    value.type === "inSet" ||
    value.type === "notInSet" ||
    value.type === "ifNa"
  ) {
    throw new Error("Not implemented filter type: " + value.type);
  }

  if (value.type === undefined) {
    throw new Error("Filter type is undefined, this should not happen");
  }

  assertNever(value);
}

export function convertFilterUiToExpressions(value: FilterSpec): Expression {
  return convertFilterUiToExpressionImpl(value).toJSON();
}
