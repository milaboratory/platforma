import { assertNever } from "@milaboratories/pl-model-common";
import type {
  FilterSpec,
  FilterSpecLeaf,
  PTableColumnId,
  SingleAxisSelector,
  SpecQueryExpression,
} from "@milaboratories/pl-model-common";

/** Parses a CanonicalizedJson<PTableColumnId> string into a SpecQueryExpression reference. */
function resolveColumnRef(columnStr: string): SpecQueryExpression {
  const parsed = JSON.parse(columnStr) as PTableColumnId;
  if (parsed.type === "axis") {
    return { type: "axisRef", value: parsed.id as SingleAxisSelector };
  }
  return { type: "columnRef", value: parsed.id };
}

/** Converts a FilterSpec tree into a SpecQueryExpression. */
export function filterSpecToExpr(filter: FilterSpec<FilterSpecLeaf<string>>): SpecQueryExpression {
  switch (filter.type) {
    case "and":
    case "or": {
      const inputs = filter.filters.filter((f) => f.type !== undefined).map(filterSpecToExpr);
      if (inputs.length === 0) {
        throw new Error(`${filter.type.toUpperCase()} filter requires at least one operand`);
      }
      return { type: filter.type, input: inputs };
    }
    case "not":
      return { type: "not", input: filterSpecToExpr(filter.filter) };

    case "patternEquals":
      return {
        type: "stringEquals",
        input: resolveColumnRef(filter.column),
        value: filter.value,
        caseInsensitive: false,
      };
    case "patternNotEquals":
      return {
        type: "not",
        input: {
          type: "stringEquals",
          input: resolveColumnRef(filter.column),
          value: filter.value,
          caseInsensitive: false,
        },
      };
    case "patternContainSubsequence":
      return {
        type: "stringContains",
        input: resolveColumnRef(filter.column),
        value: filter.value,
        caseInsensitive: false,
      };
    case "patternNotContainSubsequence":
      return {
        type: "not",
        input: {
          type: "stringContains",
          input: resolveColumnRef(filter.column),
          value: filter.value,
          caseInsensitive: false,
        },
      };
    case "patternMatchesRegularExpression":
      return {
        type: "stringRegex",
        input: resolveColumnRef(filter.column),
        value: filter.value,
      };
    case "patternFuzzyContainSubsequence":
      return {
        type: "stringContainsFuzzy",
        input: resolveColumnRef(filter.column),
        value: filter.value,
        maxEdits: filter.maxEdits ?? 1,
        caseInsensitive: false,
        substitutionsOnly: filter.substitutionsOnly ?? false,
        wildcard: filter.wildcard ?? null,
      };

    case "equal":
      return {
        type: "numericComparison",
        operand: "eq",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };
    case "notEqual":
      return {
        type: "numericComparison",
        operand: "ne",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };
    case "lessThan":
      return {
        type: "numericComparison",
        operand: "lt",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };
    case "greaterThan":
      return {
        type: "numericComparison",
        operand: "gt",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };
    case "lessThanOrEqual":
      return {
        type: "numericComparison",
        operand: "le",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };
    case "greaterThanOrEqual":
      return {
        type: "numericComparison",
        operand: "ge",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };

    case "equalToColumn":
      return {
        type: "numericComparison",
        operand: "eq",
        left: resolveColumnRef(filter.column),
        right: resolveColumnRef(filter.rhs),
      };
    case "lessThanColumn": {
      const left = resolveColumnRef(filter.column);
      const right = resolveColumnRef(filter.rhs);
      if (filter.minDiff !== undefined && filter.minDiff !== 0) {
        return {
          type: "numericComparison",
          operand: "lt",
          left: {
            type: "numericBinary",
            operand: "add",
            left,
            right: { type: "constant", value: filter.minDiff },
          },
          right,
        };
      }
      return { type: "numericComparison", operand: "lt", left, right };
    }
    case "greaterThanColumn": {
      const left = resolveColumnRef(filter.column);
      const right = resolveColumnRef(filter.rhs);
      if (filter.minDiff !== undefined && filter.minDiff !== 0) {
        return {
          type: "numericComparison",
          operand: "gt",
          left: {
            type: "numericBinary",
            operand: "add",
            left,
            right: { type: "constant", value: filter.minDiff },
          },
          right,
        };
      }
      return { type: "numericComparison", operand: "gt", left, right };
    }
    case "lessThanColumnOrEqual": {
      const left = resolveColumnRef(filter.column);
      const right = resolveColumnRef(filter.rhs);
      if (filter.minDiff !== undefined && filter.minDiff !== 0) {
        return {
          type: "numericComparison",
          operand: "le",
          left: {
            type: "numericBinary",
            operand: "add",
            left,
            right: { type: "constant", value: filter.minDiff },
          },
          right,
        };
      }
      return { type: "numericComparison", operand: "le", left, right };
    }
    case "greaterThanColumnOrEqual": {
      const left = resolveColumnRef(filter.column);
      const right = resolveColumnRef(filter.rhs);
      if (filter.minDiff !== undefined && filter.minDiff !== 0) {
        return {
          type: "numericComparison",
          operand: "ge",
          left: {
            type: "numericBinary",
            operand: "add",
            left,
            right: { type: "constant", value: filter.minDiff },
          },
          right,
        };
      }
      return { type: "numericComparison", operand: "ge", left, right };
    }

    case "inSet":
      return {
        type: "isIn",
        input: resolveColumnRef(filter.column),
        set: filter.value,
      };
    case "notInSet":
      return {
        type: "not",
        input: {
          type: "isIn",
          input: resolveColumnRef(filter.column),
          set: filter.value,
        },
      };

    case "isNA":
      return {
        type: "isNull",
        input: resolveColumnRef(filter.column),
      };
    case "isNotNA":
      return {
        type: "not",
        input: {
          type: "isNull",
          input: resolveColumnRef(filter.column),
        },
      };

    case "ifNa":
      return {
        type: "ifNull",
        input: resolveColumnRef(filter.column),
        replacement: { type: "constant", value: filter.replacement },
      };

    case "topN":
    case "bottomN":
      throw new Error(`Filter type "${filter.type}" is not supported in query expressions`);

    case undefined:
      throw new Error("Filter type is undefined");

    default:
      assertNever(filter);
  }
}
