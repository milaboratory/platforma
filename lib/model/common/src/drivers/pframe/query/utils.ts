import { canonicalizeJson } from "../../../json";
import { assertNever } from "../../../util";
import type {
  SpecQueryBooleanExpression,
  SpecQueryExpression,
  SpecQuery,
  SpecQueryJoinEntry,
} from "./query_spec";

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

export function sortQuerySpec(query: SpecQuery): SpecQuery {
  switch (query.type) {
    case "column":
    case "inlineColumn":
      return query;
    case "sparseToDenseColumn": {
      const sortedAxesIndices = query.axesIndices.toSorted((lhs, rhs) => lhs - rhs);
      return {
        ...query,
        axesIndices: sortedAxesIndices,
      };
    }
    case "innerJoin":
    case "fullJoin": {
      const sortedEntries = query.entries.map(sortQueryJoinEntrySpec);
      sortedEntries.sort(cmpQueryJoinEntrySpec);
      return {
        ...query,
        entries: sortedEntries,
      };
    }
    case "outerJoin": {
      const sortedSecondary = query.secondary.map(sortQueryJoinEntrySpec);
      sortedSecondary.sort(cmpQueryJoinEntrySpec);
      return {
        ...query,
        primary: sortQueryJoinEntrySpec(query.primary),
        secondary: sortedSecondary,
      };
    }
    case "sliceAxes": {
      const sortedAxisFilters = query.axisFilters.toSorted((lhs, rhs) => {
        const lhsKey = canonicalizeJson(lhs.axisSelector);
        const rhsKey = canonicalizeJson(rhs.axisSelector);
        return lhsKey < rhsKey ? -1 : lhsKey === rhsKey ? 0 : 1;
      });
      return {
        ...query,
        input: sortQuerySpec(query.input),
        axisFilters: sortedAxisFilters,
      };
    }
    case "sort":
      return {
        ...query,
        input: sortQuerySpec(query.input),
      };
    case "filter":
      return {
        ...query,
        input: sortQuerySpec(query.input),
      };
    default:
      assertNever(query);
  }
}

function sortQueryJoinEntrySpec(entry: SpecQueryJoinEntry): SpecQueryJoinEntry {
  const sortedQualifications = entry.qualifications.toSorted((lhs, rhs) => {
    const lhsKey = canonicalizeJson(lhs.axis);
    const rhsKey = canonicalizeJson(rhs.axis);
    return lhsKey < rhsKey ? -1 : lhsKey === rhsKey ? 0 : 1;
  });
  return {
    entry: sortQuerySpec(entry.entry),
    qualifications: sortedQualifications,
  };
}

function cmpQuerySpec(lhs: SpecQuery, rhs: SpecQuery): number {
  if (lhs.type !== rhs.type) {
    return lhs.type < rhs.type ? -1 : 1;
  }
  switch (lhs.type) {
    case "column":
      return lhs.column < (rhs as typeof lhs).column
        ? -1
        : lhs.column === (rhs as typeof lhs).column
          ? 0
          : 1;
    case "inlineColumn":
      return lhs.spec.id < (rhs as typeof lhs).spec.id
        ? -1
        : lhs.spec.id === (rhs as typeof lhs).spec.id
          ? 0
          : 1;
    case "sparseToDenseColumn":
      return lhs.column < (rhs as typeof lhs).column
        ? -1
        : lhs.column === (rhs as typeof lhs).column
          ? 0
          : 1;
    case "innerJoin":
    case "fullJoin": {
      const rhsJoin = rhs as typeof lhs;
      if (lhs.entries.length !== rhsJoin.entries.length) {
        return lhs.entries.length - rhsJoin.entries.length;
      }
      for (let i = 0; i < lhs.entries.length; i++) {
        const cmp = cmpQueryJoinEntrySpec(lhs.entries[i], rhsJoin.entries[i]);
        if (cmp !== 0) return cmp;
      }
      return 0;
    }
    case "outerJoin": {
      const rhsOuter = rhs as typeof lhs;
      const cmp = cmpQueryJoinEntrySpec(lhs.primary, rhsOuter.primary);
      if (cmp !== 0) return cmp;
      if (lhs.secondary.length !== rhsOuter.secondary.length) {
        return lhs.secondary.length - rhsOuter.secondary.length;
      }
      for (let i = 0; i < lhs.secondary.length; i++) {
        const cmp = cmpQueryJoinEntrySpec(lhs.secondary[i], rhsOuter.secondary[i]);
        if (cmp !== 0) return cmp;
      }
      return 0;
    }
    case "sliceAxes":
      return cmpQuerySpec(lhs.input, (rhs as typeof lhs).input);
    case "sort":
      return cmpQuerySpec(lhs.input, (rhs as typeof lhs).input);
    case "filter":
      return cmpQuerySpec(lhs.input, (rhs as typeof lhs).input);
    default:
      assertNever(lhs);
  }
}

function cmpQueryJoinEntrySpec(lhs: SpecQueryJoinEntry, rhs: SpecQueryJoinEntry): number {
  const cmp = cmpQuerySpec(lhs.entry, rhs.entry);
  if (cmp !== 0) return cmp;
  if (lhs.qualifications.length !== rhs.qualifications.length) {
    return lhs.qualifications.length - rhs.qualifications.length;
  }
  for (let i = 0; i < lhs.qualifications.length; i++) {
    const lhsQ = canonicalizeJson(lhs.qualifications[i]);
    const rhsQ = canonicalizeJson(rhs.qualifications[i]);
    if (lhsQ !== rhsQ) return lhsQ < rhsQ ? -1 : 1;
  }
  return 0;
}
