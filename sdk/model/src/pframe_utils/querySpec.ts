import { UnionToTuples } from "@milaboratories/helpers";
import { QueryBooleanExpressionSpec, QueryExpressionSpec } from "@milaboratories/pl-model-common";

const booleanTypesTuple: UnionToTuples<QueryBooleanExpressionSpec["type"]> = [
  "numericComparison",
  "stringEquals",
  "stringContains",
  "stringContainsFuzzy",
  "stringRegex",
  "isNull",
  "not",
  "and",
  "or",
  "isIn",
];
const booleanTypesSet = new Set(booleanTypesTuple);

export function isBooleanExpression(expr: QueryExpressionSpec): expr is QueryBooleanExpressionSpec {
  return booleanTypesSet.has(
    // @ts-expect-error -- TypeScript doesn't understand the discriminated union here, but we do at runtime
    expr.type,
  );
}
