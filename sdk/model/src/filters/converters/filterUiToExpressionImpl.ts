import { assertNever } from "@milaboratories/pl-model-common";
import type { FilterSpecLeaf } from "@milaboratories/pl-model-common";
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
import { traverseFilterSpec } from "../traverse";

export function convertFilterUiToExpressionImpl(value: FilterSpec): ExpressionImpl {
  return traverseFilterSpec(value, {
    leaf: leafToExpressionImpl,
    and: (expressions) => {
      if (expressions.length === 0) {
        throw new Error("AND filter requires at least one operand");
      }
      return and(...expressions);
    },
    or: (expressions) => {
      if (expressions.length === 0) {
        throw new Error("OR filter requires at least one operand");
      }
      return or(...expressions);
    },
    not: (result) => result.not(),
  });
}

function leafToExpressionImpl(value: FilterSpecLeaf): ExpressionImpl {
  switch (value.type) {
    case "isNA":
      return col(value.column).isNull();
    case "isNotNA":
      return col(value.column).isNotNull();
    case "patternEquals":
      return col(value.column).eq(lit(value.value));
    case "patternNotEquals":
      return col(value.column).neq(lit(value.value));
    case "patternContainSubsequence":
      return col(value.column).strContains(value.value, false, true);
    case "patternNotContainSubsequence":
      return col(value.column).strContains(value.value, false, true).not();
    case "equal":
      return col(value.column).eq(lit(value.x));
    case "notEqual":
      return col(value.column).neq(lit(value.x));
    case "lessThan":
      return col(value.column).lt(lit(value.x));
    case "greaterThan":
      return col(value.column).gt(lit(value.x));
    case "lessThanOrEqual":
      return col(value.column).le(lit(value.x));
    case "greaterThanOrEqual":
      return col(value.column).ge(lit(value.x));
    case "equalToColumn":
      return col(value.column).eq(col(value.rhs));
    case "greaterThanColumn":
      if (value.minDiff !== undefined && value.minDiff !== 0) {
        return col(value.column).plus(lit(value.minDiff)).gt(col(value.rhs));
      }
      return col(value.column).gt(col(value.rhs));
    case "lessThanColumn":
      if (value.minDiff !== undefined && value.minDiff !== 0) {
        return col(value.column).plus(lit(value.minDiff)).lt(col(value.rhs));
      }
      return col(value.column).lt(col(value.rhs));
    case "greaterThanColumnOrEqual":
      if (value.minDiff !== undefined && value.minDiff !== 0) {
        return col(value.column).plus(lit(value.minDiff)).ge(col(value.rhs));
      }
      return col(value.column).ge(col(value.rhs));
    case "lessThanColumnOrEqual":
      if (value.minDiff !== undefined && value.minDiff !== 0) {
        return col(value.column).plus(lit(value.minDiff)).le(col(value.rhs));
      }
      return col(value.column).le(col(value.rhs));
    case "topN":
      return rank(col(value.column), true).over([]).le(lit(value.n));
    case "bottomN":
      return rank(col(value.column), false).over([]).le(lit(value.n));
    case "patternMatchesRegularExpression":
    case "patternFuzzyContainSubsequence":
    case "inSet":
    case "notInSet":
    case "ifNa":
      throw new Error("Not implemented filter type: " + value.type);
    case undefined:
      throw new Error("Filter type is undefined, this should not happen");
    default:
      assertNever(value);
  }
}

export function convertFilterUiToExpressions(value: FilterSpec): Expression {
  return convertFilterUiToExpressionImpl(value).toJSON();
}
