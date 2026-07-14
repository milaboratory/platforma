import type {
  ColumnUniversalId,
  FilterSpecNode,
  PObjectId,
  PTableColumnId,
  PTableColumnIdColumn,
  PTableSorting,
  MultiColumnSelector,
  ColumnSelector,
} from "@milaboratories/pl-model-common";
import {
  canonicalizeAxisId,
  dedupColumns,
  extractPObjectId,
  uniqueBy,
} from "@milaboratories/pl-model-common";
import { collectFilterSpecColumns } from "../../../filters/traverse";
import { createColumnResolver, type ColumnResolver } from "../columnResolver";
import type { RenderCtxBase } from "../../../render";
import type {
  PlDataTableColumnsMeta,
  PlDataTableFilters,
  PlDataTableFilterSpecLeaf,
  PlDataTableModel,
} from "../typesV8";
import { upgradePlDataTableStateV2 } from "../state-migration";
import type { PlDataTableStateV2 } from "../state-migration";
import type { MatchingMode } from "@milaboratories/pl-model-common";
import {
  isLeafColumn,
  hitQualifications,
  collectLinkerColumns,
  queriesQualifications,
  type ColumnRecipe,
} from "../../../columns";
import type { DeriveLabelsOptions } from "../../../labels/derive_distinct_labels";
import {
  deriveAllLabels,
  evaluateRules,
  getEffectiveVisibility,
  getOrderPriority,
  isColumnHidden,
  buildDataStatusMap,
  toRuleColumn,
} from "./utils";
import { createPTableDefV3 } from "./createPTableDefV3";
import {
  discoverLabelColumns,
  discoverTableColumns,
  type DiscoverTableColumnOptions,
} from "./discoverColumns";
import { isNil, isPlainObject, type Nil } from "@milaboratories/helpers";
import { uniq } from "es-toolkit";

export type createPlDataTableOptionsV3 = (
  | {
      columns: Nil | DiscoverTableColumnOptions;
    }
  | {
      primaryColumns: ColumnRecipe[];
      columns: Nil | ColumnRecipe[];
    }
) & {
  tableState?: PlDataTableStateV2;

  filters?: PlDataTableFilters;
  sorting?: PTableSorting[];
  primaryJoinType?: "inner" | "full";

  labelsOptions?: DeriveLabelsOptions;
  displayOptions?: ColumnsDisplayOptions;
};

/** Structured source config — selectors/anchors instead of raw ColumnsSource. */
export type ColumnsSelectorConfig = {
  include?: MultiColumnSelector | MultiColumnSelector[];
  exclude?: MultiColumnSelector | MultiColumnSelector[];
  mode?: MatchingMode;
  maxHops?: number;
};

export type ColumnsDisplayOptions = {
  /** Column ordering rules. Higher priority = further left. First matching rule wins. */
  ordering?: ColumnOrderRule[];
  /** Column visibility rules. First matching rule wins. Unmatched columns use default visibility. */
  visibility?: ColumnVisibilityRule[];
};

export type ColumnOrderRule = {
  match: ColumnSelector;
  /** Higher number = further left in table */
  priority: number;
};

export type ColumnVisibilityRule = {
  match: ColumnSelector;
  visibility: "default" | "optional" | "hidden";
};

export function createPlDataTableV3<A, U>(
  ctx: RenderCtxBase<A, U>,
  options: createPlDataTableOptionsV3,
): PlDataTableModel | undefined {
  const state = upgradePlDataTableStateV2(options.tableState);
  const primaryJoinType = options.primaryJoinType ?? "full";

  const resolved = resolveInputColumns(ctx, options);
  if (resolved === undefined) return undefined;
  const { primary, secondary } = resolved;
  if (primary.length === 0) return undefined;

  const { direct, linked } = splitByTopology(secondary);

  const allColumns = [...primary, ...secondary];
  const derivedLabels = deriveAllLabels({
    // Skip hidden columns when deriving labels — they don't appear in the
    // table, so they shouldn't influence label disambiguation (#1623).
    columns: allColumns.filter((c) => !isColumnHidden(c.getSpec())).map(toLabelableColumn),
    deriveLabelsOptions: {
      includeNativeLabel: true,
      ...options.labelsOptions,
    },
  });

  // Rule-based visibility/order maps (keyed by bare PObjectId). Computed once
  // here: `computeHiddenColumns` needs visibility to decide the visible set,
  // and `buildColumnsMeta` (below, once the visible set is known) reuses both.
  const allColumnsForRules = [...primary, ...direct, ...linked, ...collectLinkerSnapshots(linked)];
  const visibilityByColId = evaluateRules(
    options.displayOptions?.visibility ?? [],
    allColumnsForRules,
  );
  const orderByColId = evaluateRules(options.displayOptions?.ordering ?? [], allColumnsForRules);

  const resolver = createColumnResolver(
    [...primary, ...direct, ...linked.flatMap((lc) => [...collectLinkerColumns(lc), lc])],
    { warn: ctx.logWarn.bind(ctx) },
  );

  const remapedDefaultFilters = remapFilterColumnIds(options.filters, resolver);
  const filters = filterFilters(
    concatFilters(
      state.pTableParams.filters,
      state.pTableParams.defaultFilters ?? remapedDefaultFilters,
    ),
    resolver,
  );

  const sorting = filterSorting(
    resolveSorting(state.pTableParams.sorting, remapSortingColumnIds(options.sorting, resolver)),
    resolver,
  );

  const fullDef = createPTableDefV3({
    primaryJoinType,
    primary,
    secondary: [...direct, ...linked],
    filters,
    sorting,
  });

  const fullHandle = ctx.createPTableV2(fullDef);
  // TODO: is workaround for dropdown suggestions.
  // Pframe have not equivalent data for columns relativly to Ptable.
  // PFrame is the physical column registry — one entry per bare PObjectId,
  // so strip the rich recipe ids down to their physical leaf id and dedupe:
  // multiple discovered variants of the same hit collapse to the same bare id.
  const pframeHandle = ctx.createPFrame(
    uniq([
      ...primary.map((v) => extractPObjectId(v.id)),
      ...direct.map((v) => extractPObjectId(v.id)),
      ...linked.map((v) => extractPObjectId(v.id)),
    ]),
  );

  const hiddenSpecs = state.pTableParams.hiddenColIds;
  const hiddenColumnIds = computeHiddenColumns({
    columns: [...primary, ...direct, ...linked],
    visibilityByColId,
    sorting,
    filters,
    hiddenSpecs,
  });

  const visible = {
    primary,
    direct: direct.filter((c) => !hiddenColumnIds.has(c.id)),
    linked: linked.filter((c) => !hiddenColumnIds.has(c.id)),
  };
  const visibleDef = createPTableDefV3({
    primaryJoinType,
    primary,
    secondary: [...visible.direct, ...visible.linked],
    filters,
    sorting,
  });
  const visibleHandle = ctx.createPTableV2(visibleDef);

  // Built here, where the visible set is known: per-column data status is
  // computed for visible columns only (the probe is meaningful only for what
  // the user sees), while label/visibility/order/axes cover all columns.
  const columnsMeta = buildColumnsMeta({
    fullColumns: [...primary, ...direct, ...linked],
    visibleColumns: [...visible.primary, ...visible.direct, ...visible.linked],
    primaryColumns: primary,
    derivedLabels,
    visibilityByColId,
    orderByColId,
  });

  return {
    sourceId: state.pTableParams.sourceId,
    fullTableHandle: fullHandle,
    fullPframeHandle: pframeHandle,
    visibleTableHandle: visibleHandle,
    defaultFilters: remapedDefaultFilters,
    columnsMeta,
  } satisfies PlDataTableModel;
}

type ResolvedColumns = {
  readonly primary: ColumnRecipe[];
  readonly secondary: ColumnRecipe[];
};

/** Normalize either option branch into a {primary, secondary} pair of recipes. */
function resolveInputColumns<A, U>(
  ctx: RenderCtxBase<A, U>,
  options: createPlDataTableOptionsV3,
): ResolvedColumns | undefined {
  if ("primaryColumns" in options) {
    const primary = options.primaryColumns;
    const secondary = options.columns ?? [];
    const labels = discoverLabelColumns(ctx, primary, [...primary, ...secondary]);
    // Exclude from secondary anything already present in primary: a label
    // column the block hands in as primary can be re-discovered here as a
    // label for that same axis, landing in the table twice with the same id.
    const primaryIds = new Set(primary.map((c) => c.id));
    return {
      primary,
      secondary: dedupColumns(
        [...secondary, ...labels].filter((c) => !primaryIds.has(c.id)),
        (c) => c.id,
        (c) => c.getSpec(),
      ),
    };
  }

  if (isPlainObject(options.columns)) {
    return discoverTableColumns(ctx, options.columns);
  }

  return undefined;
}

/** Split secondary recipes by query topology: leaves (no linker chain) vs joined. */
function splitByTopology(columns: ColumnRecipe[]): {
  direct: ColumnRecipe[];
  linked: ColumnRecipe[];
} {
  const direct: ColumnRecipe[] = [];
  const linked: ColumnRecipe[] = [];
  for (const c of columns) {
    if (isLeafColumn(c)) direct.push(c);
    else linked.push(c);
  }
  return { direct, linked };
}

/** All linker recipes across the given linked columns, deduped by id. */
function collectLinkerSnapshots(linked: ColumnRecipe[]): ColumnRecipe[] {
  return uniqueBy(
    linked.flatMap((c) => collectLinkerColumns(c)),
    (c) => c.id,
  );
}

function toLabelableColumn(col: ColumnRecipe) {
  return {
    id: col.id,
    spec: col.getSpec(),
    linkerPath: collectLinkerColumns(col).map((linker) => ({
      linker: { spec: linker.getSpec() },
    })),
    qualifications: {
      forHit: [...hitQualifications(col)],
      forQueries: queriesQualifications(col),
    },
  };
}

/**
 * Compute display metadata as a sidecar keyed by each emitted column's
 * `ColumnUniversalId` (and axis `AxisId`), instead of baking it into the specs
 * via `withSpecs`. Spec overrides change a recipe's id, so the same physical
 * column reached two ways would diverge into two ids and render twice; keeping
 * meta out of the spec preserves identity and lets dedup collapse such cases.
 * The UI overlays this onto the engine-emitted specs at render time.
 */
function buildColumnsMeta(params: {
  /** Every column in the table (primary + secondary) — drives `columns` and `axes`. */
  fullColumns: ColumnRecipe[];
  /** The visible subset — `status` is probed for these only. */
  visibleColumns: ColumnRecipe[];
  /** The primary join columns — their axes are the visible index; all other axes are hidden. */
  primaryColumns: ColumnRecipe[];
  derivedLabels: Record<string, string>;
  visibilityByColId: Map<PObjectId, ColumnVisibilityRule>;
  orderByColId: Map<PObjectId, ColumnOrderRule>;
}): PlDataTableColumnsMeta {
  const { fullColumns, visibleColumns, primaryColumns, derivedLabels } = params;
  const { visibilityByColId, orderByColId } = params;
  // Status only for visible columns — the probe is meaningful only for what the
  // user actually sees; non-visible columns get no `status`.
  const visibleStatus = buildDataStatusMap(visibleColumns);

  const columns = fullColumns.reduce<PlDataTableColumnsMeta["columns"]>((acc, c) => {
    const rc = toRuleColumn(c);
    acc[c.id] = {
      label: derivedLabels[c.id],
      visibility: getEffectiveVisibility(rc, visibilityByColId),
      order: getOrderPriority(rc, orderByColId),
      status: visibleStatus[c.id],
    };
    return acc;
  }, {});

  // Only primary columns declare the table's visible axes. Any axis introduced
  // solely by a secondary column (a linker-bridge axis, or a distinct-domain
  // copy) is flagged hidden — otherwise it renders as a second index axis.
  const primaryAxisKeys = new Set(
    primaryColumns.flatMap((c) => c.getSpec().axesSpec.map((a) => canonicalizeAxisId(a))),
  );
  const axes = fullColumns.reduce<PlDataTableColumnsMeta["axes"]>(
    (acc, c) =>
      c.getSpec().axesSpec.reduce((inner, ax) => {
        const key = canonicalizeAxisId(ax);
        if (inner[key] === undefined) inner[key] = { hidden: !primaryAxisKeys.has(key) };
        return inner;
      }, acc),
    {},
  );

  return { columns, axes };
}

/** Drop filter leaves whose column references cannot be resolved; rewrite the
 *  resolvable ones through the resolver. Prune empty and/or/not groups. */
function filterFilters(
  filters: Nil | PlDataTableFilters,
  resolver: ColumnResolver,
): Nil | PlDataTableFilters {
  if (isNil(filters)) return filters;

  const rewriteLeaf = (leaf: PlDataTableFilterSpecLeaf): Nil | PlDataTableFilterSpecLeaf => {
    if (leaf.type === undefined) return leaf;
    const result = { ...leaf };
    if ("column" in result) {
      const c = resolver(result.column);
      if (isNil(c)) return undefined;
      result.column = c;
    }
    if ("rhs" in result) {
      const c = resolver(result.rhs);
      if (isNil(c)) return undefined;
      result.rhs = c;
    }
    return result;
  };

  const prune = (node: PlDataTableFilterNode): Nil | PlDataTableFilterNode => {
    if (node.type === "and" || node.type === "or") {
      const kept = node.filters
        .map((f) => prune(f))
        .filter((f): f is PlDataTableFilterNode => !isNil(f));
      if (kept.length === 0) return undefined;
      return { type: node.type, filters: kept };
    }
    if (node.type === "not") {
      const inner = prune(node.filter);
      return isNil(inner) ? undefined : { type: "not", filter: inner };
    }
    return rewriteLeaf(node);
  };

  return prune(filters) as Nil | PlDataTableFilters;
}

/** Merge two filter trees into one AND-combined tree. Returns the non-nil one if the other is nil. */
function concatFilters(
  a: Nil | PlDataTableFilters,
  b: Nil | PlDataTableFilters,
): Nil | PlDataTableFilters {
  if (isNil(a)) return b;
  if (isNil(b)) return a;
  return { ...a, filters: [...a.filters, ...b.filters] };
}

/** Pick user sorting from state if set, otherwise fall back to options default.
 *  null = user has not touched sorting → use default;
 *  [] = user has explicitly cleared sorting → no sorting (default ignored). */
function resolveSorting(
  userSorting: Nil | PTableSorting[],
  defaultSorting: Nil | PTableSorting[],
): PTableSorting[] {
  return (isNil(userSorting) ? defaultSorting : userSorting) ?? [];
}

/** Rewrite sorting entries through the resolver; drop those that fail to resolve. */
function filterSorting(sorting: PTableSorting[], resolver: ColumnResolver): PTableSorting[] {
  return sorting.flatMap((s) => {
    const col = resolver(s.column);
    return isNil(col) ? [] : [{ ...s, column: col }];
  });
}

/** Determine which columns should be hidden based on state or optional-column defaults.
 *  Keyed by the recipe's logical {@link ColumnUniversalId} (rich) — variants of
 *  the same physical column are independently visible/hidden. */
function computeHiddenColumns(params: {
  columns: ColumnRecipe[];
  visibilityByColId: Map<PObjectId, ColumnVisibilityRule>;
  sorting: Nil | PTableSorting[];
  filters: Nil | PlDataTableFilters;
  hiddenSpecs: Nil | PTableColumnId[];
}): Set<ColumnUniversalId> {
  const { columns, visibilityByColId, sorting, filters, hiddenSpecs } = params;
  const visibilityOf = (c: ColumnRecipe) =>
    getEffectiveVisibility(toRuleColumn(c), visibilityByColId);
  const alwaysHidden = columns.filter((c) => visibilityOf(c) === "hidden").map((c) => c.id);
  const optionalHidden = !isNil(hiddenSpecs)
    ? hiddenSpecs.filter((s): s is PTableColumnIdColumn => s.type === "column").map((s) => s.id)
    : columns.filter((c) => visibilityOf(c) === "optional").map((c) => c.id);
  const initial = [...alwaysHidden, ...optionalHidden];
  const preserved = collectPreservedColumnIds(sorting, filters);

  return new Set(initial.filter((id) => !preserved.has(id)));
}

/** Collect IDs of columns that must remain visible (sorted, filtered). */
function collectPreservedColumnIds(
  sorting: Nil | PTableSorting[],
  filters: Nil | PlDataTableFilters,
): Set<ColumnUniversalId> {
  const sortedIds = (sorting ?? [])
    .map((s) => s.column)
    .filter((c): c is PTableColumnIdColumn => c.type === "column")
    .map((c) => c.id);

  const filterIds = !isNil(filters)
    ? collectFilterSpecColumns(filters).flatMap((c) => (c.type === "column" ? [c.id] : []))
    : [];

  return new Set<ColumnUniversalId>([...sortedIds, ...filterIds]);
}

/** Remap column references in sorting entries through the resolver.
 *  Unresolved entries are dropped with a warning (best-effort contract). */
function remapSortingColumnIds(
  sorting: Nil | PTableSorting[],
  resolver: ColumnResolver,
): Nil | PTableSorting[] {
  return sorting?.flatMap((s) => {
    const col = resolver(s.column);
    if (isNil(col)) {
      console.warn(
        `Sorting column ${JSON.stringify(s.column)} does not match any discovered column — dropped.`,
      );
      return [];
    }
    return [{ ...s, column: col }];
  });
}

type PlDataTableFilterNode = FilterSpecNode<PlDataTableFilterSpecLeaf>;

/** Remap column references in a filter tree through the resolver.
 *  Unresolved leaves are dropped with a warning; empty groups are pruned. */
function remapFilterColumnIds(
  filters: Nil | PlDataTableFilters,
  resolver: ColumnResolver,
): Nil | PlDataTableFilters {
  if (isNil(filters)) return filters;

  const mapLeaf = (leaf: PlDataTableFilterSpecLeaf): Nil | PlDataTableFilterSpecLeaf => {
    if (leaf.type === undefined) return leaf;
    const result = { ...leaf };
    if ("column" in result) {
      const c = resolver(result.column);
      if (isNil(c)) {
        console.warn(
          `Filter column ${JSON.stringify(result.column)} does not match any discovered column — dropped.`,
        );
        return undefined;
      }
      result.column = c;
    }
    if ("rhs" in result) {
      const c = resolver(result.rhs);
      if (isNil(c)) {
        console.warn(
          `Filter rhs ${JSON.stringify(result.rhs)} does not match any discovered column — dropped.`,
        );
        return undefined;
      }
      result.rhs = c;
    }
    return result;
  };

  const prune = (node: PlDataTableFilterNode): Nil | PlDataTableFilterNode => {
    if (node.type === "and" || node.type === "or") {
      const kept = node.filters
        .map((f) => prune(f))
        .filter((f): f is PlDataTableFilterNode => !isNil(f));
      if (kept.length === 0) return undefined;
      return { type: node.type, filters: kept };
    }
    if (node.type === "not") {
      const inner = prune(node.filter);
      return isNil(inner) ? undefined : { type: "not", filter: inner };
    }
    return mapLeaf(node);
  };

  return prune(filters) as Nil | PlDataTableFilters;
}
