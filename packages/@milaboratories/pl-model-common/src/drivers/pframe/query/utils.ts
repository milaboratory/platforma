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

/**
 * Recursively traverses a SpecQuery tree bottom-up, applying visitor callbacks.
 *
 * Traversal order:
 * 1. Recurse into child queries
 * 2. Apply `column` to transform column references in leaf nodes
 * 3. Apply `joinEntry` to each join entry (with inner query already traversed)
 * 4. Assemble node with transformed children
 * 5. Apply `node` to the assembled node
 */
export function traverseQuerySpec<C1, C2>(
  query: SpecQuery<C1>,
  visitor: {
    /** Transform column references in leaf nodes (column, sparseToDenseColumn). */
    column: (c: C1) => C2;
    /** Visit a node after its children have been traversed. */
    node?: (node: SpecQuery<C2>) => SpecQuery<C2>;
    /** Visit a join entry after its inner query has been traversed. */
    joinEntry?: (entry: SpecQueryJoinEntry<C2>) => SpecQueryJoinEntry<C2>;
  },
): SpecQuery<C2> {
  const traverseEntry = (entry: SpecQueryJoinEntry<C1>): SpecQueryJoinEntry<C2> => {
    const traversed: SpecQueryJoinEntry<C2> = {
      ...entry,
      entry: traverseQuerySpec(entry.entry, visitor),
    };
    return visitor.joinEntry ? visitor.joinEntry(traversed) : traversed;
  };

  let result: SpecQuery<C2>;
  switch (query.type) {
    case "column":
      result = { type: "column", column: visitor.column(query.column) };
      break;
    case "sparseToDenseColumn":
      result = { ...query, column: visitor.column(query.column) };
      break;
    case "inlineColumn":
      result = query;
      break;
    case "innerJoin":
    case "fullJoin":
      result = { ...query, entries: query.entries.map(traverseEntry) };
      break;
    case "outerJoin":
      result = {
        ...query,
        primary: traverseEntry(query.primary),
        secondary: query.secondary.map(traverseEntry),
      };
      break;
    case "filter":
    case "sort":
    case "sliceAxes":
      result = { ...query, input: traverseQuerySpec(query.input, visitor) };
      break;
    default:
      assertNever(query);
  }

  return visitor.node ? visitor.node(result) : result;
}

/** Recursively maps all column references in a SpecQuery tree. */
export function mapSpecQueryColumns<C1, C2>(
  query: SpecQuery<C1>,
  cb: (c: C1) => C2,
): SpecQuery<C2> {
  return traverseQuerySpec(query, { column: cb });
}

/** Collects all column references from a SpecQuery tree. */
export function collectSpecQueryColumns<C>(query: SpecQuery<C>): C[] {
  const result: C[] = [];
  traverseQuerySpec(query, {
    column: (c: C) => {
      result.push(c);
      return c;
    },
  });
  return result;
}

export function sortSpecQuery(query: SpecQuery): SpecQuery {
  return traverseQuerySpec(query, {
    column: (c) => c,
    node: (node) => {
      switch (node.type) {
        case "sparseToDenseColumn":
          return { ...node, axesIndices: node.axesIndices.toSorted((a, b) => a - b) };
        case "innerJoin":
        case "fullJoin": {
          const sorted = [...node.entries].sort(cmpQueryJoinEntrySpec);
          return { ...node, entries: sorted };
        }
        case "outerJoin": {
          const sorted = [...node.secondary].sort(cmpQueryJoinEntrySpec);
          return { ...node, secondary: sorted };
        }
        case "sliceAxes":
          return {
            ...node,
            axisFilters: node.axisFilters.toSorted((a, b) => {
              const ak = canonicalizeJson(a.axisSelector);
              const bk = canonicalizeJson(b.axisSelector);
              return ak < bk ? -1 : ak === bk ? 0 : 1;
            }),
          };
        default:
          return node;
      }
    },
    joinEntry: (entry) => ({
      ...entry,
      qualifications: entry.qualifications.toSorted((a, b) => {
        const ak = canonicalizeJson(a.axis);
        const bk = canonicalizeJson(b.axis);
        return ak < bk ? -1 : ak === bk ? 0 : 1;
      }),
    }),
  });
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
