import {
  makeDefaultPTableParams,
  parseJson,
  upgradePlDataTableStateV2,
  canonicalizeJson,
  readDomain,
  readAnnotation,
  Annotation,
  Domain,
  getAxisId,
  type PlDataTableAdvancedFilter,
  type PlDataTableGridStateCore,
  type PlDataTableSheetState,
  type PlDataTableStateV2,
  type PlDataTableStateV2CacheEntry,
  type PlDataTableStateV2Normalized,
  type PObjectId,
  type PTableColumnId,
  type PTableColumnSpec,
  type PTableParamsV2,
  type PTableRecordFilter,
  type PTableSorting,
  type SingleValuePredicateV2,
  type FilterSpec,
  type FilterSpecLeaf,
} from "@platforma-sdk/model";
import { computed, watch, type Ref, type WritableComputedRef } from "vue";
import type { PlDataTableSettingsV2 } from "../types";
import { isJsonEqual } from "@milaboratories/helpers";
import { computedCached } from "@milaboratories/uikit";

type PlDataTableStateV2CacheEntryNullable =
  | PlDataTableStateV2CacheEntry
  | {
      sourceId: null;
      gridState: Record<string, never>;
      sheetsState: [];
      filtersState: null;
    };

function makeDefaultState(): PlDataTableStateV2CacheEntryNullable {
  return {
    sourceId: null,
    gridState: {},
    sheetsState: [],
    filtersState: null,
  };
}

function getHiddenColIds(state: PlDataTableGridStateCore["columnVisibility"]): PObjectId[] | null {
  return (
    state?.hiddenColIds?.map(parseJson).reduce((acc, c) => {
      if (c.source.type === "column") {
        acc.push(c.source.id);
      }
      return acc;
    }, [] as PObjectId[]) ?? null
  );
}

function makePartitionFilters(sheetsState: PlDataTableSheetState[]): PTableRecordFilter[] {
  return sheetsState.map((s) => ({
    type: "bySingleColumnV2",
    column: {
      type: "axis",
      id: s.axisId,
    },
    predicate: {
      operator: "Equal",
      reference: s.value,
    },
  }));
}

// --- Advanced filter converter ---

type AdvancedFilterNode = FilterSpec<FilterSpecLeaf<string>, { id: number; isExpanded?: boolean }>;

/** Result of processing a filter tree node: column -> predicate pairs */
type ColumnPredicatePair = {
  columnId: string;
  predicate: SingleValuePredicateV2;
};

function makeFilterColumnId(spec: PTableColumnSpec): string {
  const id: PTableColumnId =
    spec.type === "axis"
      ? { type: "axis", id: getAxisId(spec.spec) }
      : { type: "column", id: spec.id };
  return canonicalizeJson<PTableColumnId>(id);
}

function parseFilterColumnId(columnId: string): PTableColumnId {
  return JSON.parse(columnId) as PTableColumnId;
}

function isAlphabeticColumn(spec: PTableColumnSpec): boolean {
  const valueType = spec.type === "column" ? spec.spec.valueType : spec.spec.type;
  if (valueType !== "String") return false;
  return (
    (readDomain(spec.spec, Domain.Alphabet) ?? readAnnotation(spec.spec, Annotation.Alphabet)) !==
    undefined
  );
}

/** Convert a single leaf filter to SingleValuePredicateV2 */
function leafToPredicate(
  leaf: FilterSpecLeaf<string>,
  alphabetic: boolean,
): SingleValuePredicateV2 | null {
  switch (leaf.type) {
    case "isNA":
      return { operator: "IsNA" };
    case "isNotNA":
      return { operator: "Not", operand: { operator: "IsNA" } };
    case "equal":
      return { operator: "Equal", reference: leaf.x };
    case "notEqual":
      return { operator: "Not", operand: { operator: "Equal", reference: leaf.x } };
    case "greaterThan":
      return { operator: "Greater", reference: leaf.x };
    case "greaterThanOrEqual":
      return { operator: "GreaterOrEqual", reference: leaf.x };
    case "lessThan":
      return { operator: "Less", reference: leaf.x };
    case "lessThanOrEqual":
      return { operator: "LessOrEqual", reference: leaf.x };
    case "patternEquals":
      return { operator: alphabetic ? "IEqual" : "Equal", reference: leaf.value };
    case "patternNotEquals":
      return {
        operator: "Not",
        operand: { operator: alphabetic ? "IEqual" : "Equal", reference: leaf.value },
      };
    case "patternContainSubsequence":
      return {
        operator: alphabetic ? "StringIContains" : "StringContains",
        substring: leaf.value,
      };
    case "patternNotContainSubsequence":
      return {
        operator: "Not",
        operand: {
          operator: alphabetic ? "StringIContains" : "StringContains",
          substring: leaf.value,
        },
      };
    case "patternMatchesRegularExpression":
      return { operator: "Matches", regex: leaf.value };
    case "patternFuzzyContainSubsequence":
      return {
        operator: alphabetic ? "StringIContainsFuzzy" : "StringContainsFuzzy",
        reference: leaf.value,
        maxEdits: leaf.maxEdits ?? 2,
        substitutionsOnly: leaf.substitutionsOnly ?? false,
        wildcard: leaf.wildcard,
      };
    case "inSet":
      return { operator: "InSet", references: leaf.value };
    case "notInSet":
      return { operator: "Not", operand: { operator: "InSet", references: leaf.value } };
    // topN/bottomN can't be represented as SingleValuePredicateV2 - skip
    case "topN":
    case "bottomN":
      return null;
    default:
      return null;
  }
}

/** Check if a node is a leaf filter (has a column field) */
function isLeafNode(
  node: AdvancedFilterNode,
): node is FilterSpecLeaf<string> & { id: number; isExpanded?: boolean } {
  return node.type !== "and" && node.type !== "or" && node.type !== "not";
}

/**
 * Recursively process a filter tree node into column-predicate pairs.
 * For AND/OR nodes, predicates for the same column are combined.
 */
function processFilterNode(
  node: AdvancedFilterNode,
  alphabeticSet: Set<string>,
): ColumnPredicatePair[] {
  if (isLeafNode(node)) {
    if (node.type === undefined) return [];
    const alphabetic = alphabeticSet.has(node.column);
    const predicate = leafToPredicate(node, alphabetic);
    if (!predicate) return [];
    return [{ columnId: node.column, predicate }];
  }

  if (node.type === "not") {
    const childPairs = processFilterNode(node.filter as AdvancedFilterNode, alphabeticSet);
    return childPairs.map((pair) => ({
      columnId: pair.columnId,
      predicate: { operator: "Not" as const, operand: pair.predicate },
    }));
  }

  // AND or OR node
  const allPairs: ColumnPredicatePair[] = [];
  for (const child of node.filters as AdvancedFilterNode[]) {
    allPairs.push(...processFilterNode(child, alphabeticSet));
  }

  // Group by column
  const byColumn = new Map<string, SingleValuePredicateV2[]>();
  for (const pair of allPairs) {
    if (!byColumn.has(pair.columnId)) byColumn.set(pair.columnId, []);
    byColumn.get(pair.columnId)!.push(pair.predicate);
  }

  // Combine predicates per column using the node's operator
  const result: ColumnPredicatePair[] = [];
  for (const [columnId, predicates] of byColumn) {
    if (predicates.length === 1) {
      result.push({ columnId, predicate: predicates[0] });
    } else {
      result.push({
        columnId,
        predicate: {
          operator: node.type === "or" ? ("Or" as const) : ("And" as const),
          operands: predicates,
        },
      });
    }
  }
  return result;
}

/**
 * Convert a PlDataTableAdvancedFilter tree to PTableRecordFilter[].
 * @param filter The advanced filter tree (or null for no filters)
 * @param columns Available columns (used for alphabetic detection)
 */
function makeFilters(
  filter: PlDataTableAdvancedFilter | null,
  columns: PTableColumnSpec[],
): PTableRecordFilter[] {
  if (!filter) return [];
  if (filter.type !== "and" && filter.type !== "or") return [];
  if (!("filters" in filter) || !Array.isArray(filter.filters)) return [];

  // Build alphabetic column set
  const alphabeticSet = new Set<string>();
  for (const col of columns) {
    if (isAlphabeticColumn(col)) {
      alphabeticSet.add(makeFilterColumnId(col));
    }
  }

  const pairs = processFilterNode(filter as AdvancedFilterNode, alphabeticSet);

  // Convert column IDs back to PTableColumnId
  return pairs.map((pair) => ({
    type: "bySingleColumnV2" as const,
    column: parseFilterColumnId(pair.columnId),
    predicate: pair.predicate,
  }));
}

// --- End converter ---

function makeSorting(state: PlDataTableGridStateCore["sort"]): PTableSorting[] {
  return (
    state?.sortModel.map((item) => {
      const { spec: _, ...column } = parseJson(item.colId).labeled;
      return {
        column,
        ascending: item.sort === "asc",
        naAndAbsentAreLeastValues: item.sort === "asc",
      };
    }) ?? []
  );
}

function makePTableParams(
  state: PlDataTableStateV2CacheEntry,
  columns: PTableColumnSpec[],
): PTableParamsV2 {
  return {
    sourceId: state.sourceId,
    hiddenColIds: getHiddenColIds(state.gridState.columnVisibility),
    partitionFilters: makePartitionFilters(state.sheetsState),
    filters: makeFilters(state.filtersState, columns),
    sorting: makeSorting(state.gridState.sort),
  };
}

export function useTableState(
  tableStateDenormalized: Ref<PlDataTableStateV2>,
  settings: Ref<PlDataTableSettingsV2>,
  filterableColumns: Ref<PTableColumnSpec[]>,
): {
  gridState: WritableComputedRef<PlDataTableGridStateCore>;
  sheetsState: WritableComputedRef<PlDataTableSheetState[]>;
  filtersState: WritableComputedRef<PlDataTableAdvancedFilter | null>;
} {
  const tableStateNormalized = computedCached<PlDataTableStateV2Normalized>({
    get: () => upgradePlDataTableStateV2(tableStateDenormalized.value),
    set: (newState) => (tableStateDenormalized.value = newState),
  });

  const tableState = computed<PlDataTableStateV2CacheEntryNullable>({
    get: () => {
      const defaultState = makeDefaultState();

      const sourceId = settings.value.sourceId;
      if (!sourceId) return defaultState;

      const cachedState = tableStateNormalized.value.stateCache.find(
        (entry) => entry.sourceId === sourceId,
      );
      if (!cachedState)
        return {
          ...defaultState,
          sourceId,
        };

      return cachedState;
    },
    set: (state) => {
      const oldState = { ...tableStateNormalized.value };
      const newState: PlDataTableStateV2Normalized = {
        ...oldState,
        pTableParams: makeDefaultPTableParams(),
      };

      if (state.sourceId) {
        newState.pTableParams = makePTableParams(state, filterableColumns.value);

        const stateIdx = newState.stateCache.findIndex(
          (entry) => entry.sourceId === state.sourceId,
        );
        if (stateIdx !== -1) {
          newState.stateCache[stateIdx] = state;
        } else {
          const CacheDepth = 5;
          newState.stateCache.push(state);
          newState.stateCache = newState.stateCache.slice(-CacheDepth);
        }
      }

      tableStateNormalized.value = newState;
    },
  });

  // Update pTableParams when sourceId changes
  watch(
    () => tableState.value,
    (state) => {
      const newParams = state.sourceId
        ? makePTableParams(state, filterableColumns.value)
        : makeDefaultPTableParams();
      const oldParams = tableStateNormalized.value.pTableParams;
      if (!isJsonEqual(newParams, oldParams)) {
        tableStateNormalized.value = {
          ...tableStateNormalized.value,
          pTableParams: newParams,
        };
      }
    },
    { deep: true },
  );

  const gridState = computed<PlDataTableGridStateCore>({
    get: () => tableState.value.gridState,
    set: (gridState) => {
      const oldState = tableState.value;
      if (oldState.sourceId) {
        tableState.value = {
          ...oldState,
          gridState,
        };
      }
    },
  });

  const sheetsState = computed<PlDataTableSheetState[]>({
    get: () => tableState.value.sheetsState,
    set: (sheetsState) => {
      const oldState = tableState.value;
      if (oldState.sourceId) {
        tableState.value = {
          ...oldState,
          sheetsState,
        };
      }
    },
  });

  const filtersState = computed<PlDataTableAdvancedFilter | null>({
    get: () => tableState.value.filtersState,
    set: (filtersState) => {
      const oldState = tableState.value;
      if (oldState.sourceId) {
        tableState.value = {
          ...oldState,
          filtersState,
        };
      }
    },
  });

  return { gridState, sheetsState, filtersState };
}
