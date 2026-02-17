import { assertNever } from "../../../util";
import type { SpecQueryBooleanExpression, SpecQueryExpression, SpecQuery } from "./query_spec";

const booleanTypesSet = new Set<SpecQueryBooleanExpression["type"]>([
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
]);

export function isBooleanExpression(expr: SpecQueryExpression): expr is SpecQueryBooleanExpression {
  return booleanTypesSet.has(
    // @ts-expect-error -- TypeScript doesn't understand the discriminated union here, but we do at runtime
    expr.type,
  );
}

/** Collects all column references from a SpecQuery tree. */
export function collectQueryColumns<C>(query: SpecQuery<C>): C[] {
  const result: C[] = [];
  collectQueryColumnsImpl(query, result);
  return result;
}

function collectQueryColumnsImpl<C>(query: SpecQuery<C>, result: C[]): void {
  switch (query.type) {
    case "column":
      result.push(query.column);
      break;
    case "sparseToDenseColumn":
      result.push(query.column);
      break;
    case "inlineColumn":
      break;
    case "innerJoin":
    case "fullJoin":
      for (const e of query.entries) collectQueryColumnsImpl(e.entry, result);
      break;
    case "outerJoin":
      collectQueryColumnsImpl(query.primary.entry, result);
      for (const e of query.secondary) collectQueryColumnsImpl(e.entry, result);
      break;
    case "filter":
    case "sort":
    case "sliceAxes":
      collectQueryColumnsImpl(query.input, result);
      break;
    default:
      assertNever(query);
  }
}
