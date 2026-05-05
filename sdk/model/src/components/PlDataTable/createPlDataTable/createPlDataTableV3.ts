import type {
  AxisId,
  CanonicalizedJson,
  FilterSpecNode,
  PColumn,
  PObjectId,
  PTableColumnId,
  PTableColumnIdAxis,
  PTableColumnIdColumn,
  PTableSorting,
  PColumnSpec,
  MultiColumnSelector,
  PFrameSpecDriver,
  DiscoveredPColumnId,
} from "@milaboratories/pl-model-common";
import {
  Annotation,
  canonicalizeJson,
  createDiscoveredPColumnId,
  getAxisId,
  parseJson,
  uniqueBy,
} from "@milaboratories/pl-model-common";
import { collectFilterSpecColumns, traverseFilterSpec } from "../../../filters/traverse";
import { TreeNodeAccessor } from "../../../render/accessor";
import type { RenderCtxBase, PColumnDataUniversal } from "../../../render";
import { isEmpty } from "es-toolkit/compat";
import type { PlDataTableFilters, PlDataTableFilterSpecLeaf, PlDataTableModel } from "../typesV5";
import { upgradePlDataTableStateV2 } from "../state-migration";
import type { PlDataTableStateV2 } from "../state-migration";
import type {
  ColumnSelector,
  ColumnSnapshot,
  ColumnVariant,
  MatchingMode,
  MatchQualifications,
} from "../../../columns";
import {
  ArrayColumnProvider,
  ColumnCollectionBuilder,
  OutputColumnProvider,
  SnapshotColumnProvider,
  collectCtxColumnSnapshotProviders,
} from "../../../columns";
import type { DeriveLabelsOptions } from "../../../labels/derive_distinct_labels";
import {
  deriveAllLabels,
  deriveAllTooltips,
  evaluateRules,
  isColumnHidden,
  isColumnOptional,
  withHidenAxesAnnotations,
  withLabelAnnotations,
  withTableVisualAnnotations,
  withInfoAnnotations,
  withDataStatusAnnotations,
} from "./utils";
import type { PrimaryEntry, SecondaryGroup } from "./createPTableDefV3";
import { createPTableDefV3 } from "./createPTableDefV3";
import { discoverTableColumnSnaphots, type DiscoverTableColumnOptions } from "./discoverColumns";
import { isNil, isPlainObject, throwError, type Nil } from "@milaboratories/helpers";
import { flow } from "es-toolkit";

// ---------------------------------------------------------------------------
// Public options
// ---------------------------------------------------------------------------

/**
 * Options for {@link createPlDataTableV3}.
 *
 * Two ways to specify columns:
 *
 * 1. **Simple case** (most blocks): `primaryColumns` + optional `enrichFromPool`.
 *    Pass the workflow-output columns this block produces; optionally pull in
 *    joinable columns from the result pool with a default visibility.
 *
 * 2. **Advanced case**: `columns: { sources, anchors, selector }` for explicit
 *    discovery configuration (custom sources, specific anchor selection,
 *    selector-mode tuning), or `columns: TableColumnVariant[]` for
 *    pre-discovered variants.
 *
 * `primaryColumns` and `columns` are mutually exclusive.
 */
export type createPlDataTableOptionsV3 = {
  /**
   * Round-tripped UI state — sort, filters, hidden columns, fast search.
   * Typically `ctx.data.tableState`.
   */
  tableState?: PlDataTableStateV2;

  /**
   * Columns this block produces (always visible, drive the join row count).
   *
   * Accepts:
   *  - `TreeNodeAccessor` — typically `ctx.outputs?.resolve('mainPf')`.
   *    Preserves per-column `dataStatus` for partial-data rendering.
   *  - `PColumn<PColumnDataUniversal>[]` — typically `accessor.getPColumns()`.
   *  - `TableColumnVariant[]` — explicit variants, for power users.
   *
   * Mutually exclusive with `columns`. When neither is set or this resolves
   * to an empty list, the function returns `undefined`.
   */
  primaryColumns?: TreeNodeAccessor | PColumn<PColumnDataUniversal>[] | TableColumnVariant[];

  /**
   * Pull joinable columns from the result pool (linker traversal supported).
   * Discovered columns are tagged `isPrimary: false` and receive the
   * configured visibility — the user can then toggle them in the column manager.
   *
   * Internally this anchors discovery against each primary column, so any pool
   * column reachable from the primary axes (directly or via linkers) is included.
   * Columns whose `NativePObjectId` matches a primary column are skipped — the
   * primary version always wins.
   *
   * Shorthands:
   *  - `false` (default) — no enrichment.
   *  - `true` — equivalent to `'optional'`.
   *  - `'optional' | 'hidden' | 'default'` — sets `visibility` to that value.
   *  - object form for full control.
   *
   * Has no effect when `columns` is used instead of `primaryColumns`.
   *
   * @default false
   */
  enrichFromPool?: false | true | "optional" | "hidden" | "default" | EnrichFromPoolOptions;

  /**
   * Advanced column input — bypasses `primaryColumns` / `enrichFromPool`.
   *
   * Accepts:
   *  - `DiscoverTableColumnOptions` — `{ sources, anchors, selector }` for
   *    explicit discovery configuration.
   *  - `TableColumnVariant[]` — pre-discovered variants.
   *  - `Nil` — short-circuits the function to return `undefined`.
   *
   * Mutually exclusive with `primaryColumns`.
   */
  columns?: Nil | DiscoverTableColumnOptions | TableColumnVariant[];

  /**
   * Default filter applied on top of user filters; user can reset it from the UI.
   * Stored separately from the user filters in the table state.
   */
  filters?: PlDataTableFilters;

  /**
   * Default sort applied when the user has not chosen a sort.
   * User-chosen sort (in `tableState.pTableParams.sorting`) takes precedence.
   */
  sorting?: PTableSorting[];

  /**
   * Join semantics for primary columns.
   *  - `"full"` (default) — outer join, rows from any primary column.
   *  - `"inner"` — intersection only.
   *
   * @default "full"
   */
  primaryJoinType?: "inner" | "full";

  /**
   * Tweaks for label derivation (e.g. `formatters.linker` to override
   * the default "via X > Y" linker prefix).
   */
  labelsOptions?: DeriveLabelsOptions;

  /**
   * Per-spec ordering and visibility rules. First matching rule wins;
   * unmatched columns fall back to their own `pl7.app/table/orderPriority`
   * and `pl7.app/table/visibility` annotations.
   */
  displayOptions?: ColumnsDisplayOptions;
};

/** Full-form configuration for {@link createPlDataTableOptionsV3.enrichFromPool}. */
export type EnrichFromPoolOptions = {
  /**
   * Default visibility applied to enrichment columns.
   *  - `"optional"` — hidden by default, user can toggle on in column manager (recommended).
   *  - `"hidden"` — never shown anywhere (rare; usually means you don't want enrichment).
   *  - `"default"` — visible alongside primary columns.
   *
   * User-supplied `displayOptions.visibility` rules still take precedence per
   * the usual first-match-wins semantics.
   *
   * @default "optional"
   */
  visibility?: "optional" | "hidden" | "default";
  /** Selector(s) excluding columns from enrichment discovery. */
  exclude?: MultiColumnSelector | MultiColumnSelector[];
  /**
   * Maximum linker hops when traversing from anchors.
   * @default 4
   */
  maxHops?: number;
  /**
   * Axis matching strategy passed to the discovery engine.
   * @default "enrichment"
   */
  mode?: MatchingMode;
};

/**
 * Selector configuration passed through to anchored discovery
 * (`AnchoredColumnCollection.findColumnVariants`). All fields are optional —
 * an empty config matches every column reachable from the anchors.
 */
export type ColumnsSelectorConfig = {
  /** Include only columns matching these selector(s). */
  include?: MultiColumnSelector | MultiColumnSelector[];
  /** Exclude columns matching these selector(s) (applied after include). */
  exclude?: MultiColumnSelector | MultiColumnSelector[];
  /**
   * Axis matching strategy. See `MatchingMode` for full semantics.
   *  - `"enrichment"` (default) — columns whose axes are subsets of anchor axes.
   *  - `"related"` — columns sharing at least one axis with an anchor.
   *  - `"exact"` — columns with axes exactly matching an anchor.
   * @default "enrichment"
   */
  mode?: MatchingMode;
  /**
   * Maximum number of linker hops when traversing across axis domains.
   * @default 4
   */
  maxHops?: number;
};

/** Per-spec ordering and visibility rules. */
export type ColumnsDisplayOptions = {
  /** Column ordering rules. Higher priority = further left. First matching rule wins. */
  ordering?: ColumnOrderRule[];
  /** Column visibility rules. First matching rule wins. Unmatched columns use default visibility. */
  visibility?: ColumnVisibilityRule[];
};

/** Single ordering rule. Match either by predicate (on `PColumnSpec`) or by selector. */
export type ColumnOrderRule = {
  match: ColumnMatcher | ColumnSelector;
  /** Higher number = further left in table. */
  priority: number;
};

/** Single visibility rule. Match either by predicate (on `PColumnSpec`) or by selector. */
export type ColumnVisibilityRule = {
  match: ColumnMatcher | ColumnSelector;
  /**
   *  - `"default"` — shown by default.
   *  - `"optional"` — hidden by default, user can toggle on in column manager.
   *  - `"hidden"` — never shown anywhere.
   */
  visibility: "default" | "optional" | "hidden";
};

/** Predicate over a `PColumnSpec` used by display rules. */
export type ColumnMatcher = (spec: PColumnSpec) => boolean;

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Build a data-table model from block-generated columns and (optionally)
 * joinable columns discovered in the result pool.
 *
 * Common usage (workflow output as primary columns, pool as optional extras):
 *
 * ```ts
 * .outputWithStatus('mainTable', (ctx) =>
 *   createPlDataTableV3(ctx, {
 *     tableState: ctx.data.tableState,
 *     primaryColumns: ctx.outputs?.resolve('mainPf'),
 *     enrichFromPool: 'optional',
 *   }),
 * )
 * ```
 *
 * Returns `undefined` when:
 *  - `primaryColumns` resolves to an empty list (or `undefined`), and
 *  - `columns` is `Nil` or resolves to an empty list.
 *
 * @param ctx - Block render context (provides driver, outputs, prerun, result pool).
 * @param options - Column source, filters, sorting, display rules, etc.
 *                  See {@link createPlDataTableOptionsV3}.
 * @returns A `PlDataTableModel` consumable by `PlAgDataTableV2`, or `undefined`
 *          when the table cannot be built yet.
 */
export function createPlDataTableV3<A, U>(
  ctx: RenderCtxBase<A, U>,
  options: createPlDataTableOptionsV3,
): PlDataTableModel | undefined {
  // --- Mutual exclusion of high-level inputs ---
  if (options.primaryColumns !== undefined && options.columns !== undefined) {
    throw new Error(
      "createPlDataTableV3: `primaryColumns` and `columns` are mutually exclusive — pass one or the other.",
    );
  }

  const pframeSpec = ctx.getService("pframeSpec");
  const state = upgradePlDataTableStateV2(options.tableState);
  const primaryJoinType = options.primaryJoinType ?? "full";

  // --- Resolve column input into a flat TableColumnVariant[] ---
  // Three shapes feed in here; we normalize them all so the rest of the
  // pipeline operates on a uniform list of variants with required fields.
  const discovered = resolveColumns(ctx, options);
  if (isNil(discovered) || discovered.length === 0) return undefined;

  // Split into "direct" (no linker path) and "linked" (reached via linker hops).
  // The two groups go through slightly different annotation pipelines below
  // (linked columns also get hidden-axes annotations on linker steps).
  const split = splitDiscoveredColumns(discovered);

  // --- Derive display labels and tooltips from the discovered set ---
  // Labels are computed jointly so that columns sharing names get
  // distinguishing suffixes (handled by `deriveDistinctLabels` upstream).
  const derivedLabels = deriveAllLabels({
    columns: discovered.map((dc) => ({
      id: dc.column.id,
      spec: dc.column.spec,
      linkerPath: dc.path,
      qualifications: dc.qualifications,
    })),
    deriveLabelsOptions: {
      includeNativeLabel: true,
      ...options.labelsOptions,
    },
  });

  const derivedTooltips = deriveAllTooltips({
    columns: discovered.map((dc) => ({
      id: dc.column.id,
      originalId: dc.originalId,
      spec: dc.column.spec,
      linkerPath: dc.path,
      qualifications: dc.qualifications,
    })),
  });

  // --- Annotate column groups with derived labels, tooltips, and display rules ---
  const annotated = annotateColumnGroups({
    pframeSpec,
    ...split,
    derivedLabels,
    derivedTooltips,
    displayOptions: options.displayOptions,
  });

  // Primary columns drive the join (one row per primary key tuple).
  // Secondary columns are joined on top with their own qualification axes.
  const primarySnapshots = annotated.direct.filter((c) => c.isPrimary);
  const secondarySnapshots = annotated.direct.filter((c) => !c.isPrimary);
  if (primarySnapshots.length === 0) return undefined;

  // --- Build column-id index for filter / sorting validation ---
  // Includes axis IDs (from primary axesSpec) plus column IDs of every
  // discovered direct + linked + linker column. References to non-existent
  // columns are dropped from filters/sorting downstream.
  const columnIsAvailable = createColumnValidationById([
    ...annotated.direct.map((v) => v.column),
    ...annotated.linked.flatMap((lc) => [...lc.path.map((s) => s.linker), lc.column]),
  ]);

  // --- Resolve filters: user filters AND-combined with default filters,
  //     then prune leaves that reference columns no longer in the table ---
  const remapedDefaultFilters = remapFilterColumnIds(options.filters, discovered);
  const filters = filterFilters(
    concatFilters(
      state.pTableParams.filters,
      state.pTableParams.defaultFilters ?? remapedDefaultFilters,
    ),
    columnIsAvailable,
  );

  // --- Resolve sorting: user sort if non-empty else default sort,
  //     remapped to discovered IDs, then pruned for missing columns ---
  const sorting = filterSorting(
    resolveSorting(state.pTableParams.sorting, remapSortingColumnIds(options.sorting, discovered)),
    columnIsAvailable,
  );

  // --- Build the FULL-table handle (all discovered columns, hidden or not) ---
  // The full handle is what the column manager uses to expose toggleable columns;
  // the visible handle below is what actually drives row rendering.
  const primaryEntries: PrimaryEntry<undefined | PColumnDataUniversal>[] = primarySnapshots.map(
    (v) => ({ column: resolveSnapshot(v.column) }),
  );
  const secondaryGroups: SecondaryGroup<undefined | PColumnDataUniversal>[] = buildSecondaryGroups(
    secondarySnapshots,
    annotated.linked,
  );
  const fullDef = createPTableDefV3({
    primaryJoinType,
    primary: primaryEntries,
    secondary: secondaryGroups,
    filters,
    sorting,
  });

  const fullHandle = ctx.createPTableV2(fullDef);
  // PFrame handle exposed alongside the table (used by filter UI for value
  // suggestions / autocomplete — PTable doesn't expose per-column data the
  // same way PFrame does, so we ship a parallel PFrame).
  const pframeHandle = ctx.createPFrame([
    ...annotated.direct.map((v) => resolveSnapshot(v.column)),
    ...annotated.linked.map((v) => resolveSnapshot(v.column)),
    ...collectLinkerSnapshots(annotated.linked).map(resolveSnapshot),
  ]);

  // --- Determine which columns are hidden, then build the VISIBLE-table handle ---
  // The visible handle excludes hidden/optional columns the user has not
  // explicitly enabled, but preserves any columns referenced by sort/filter
  // (those must remain in the join for the predicate to evaluate).
  const hiddenSpecs = state.pTableParams.hiddenColIds;
  const hiddenColumnIds = computeHiddenColumns(
    [...annotated.direct, ...annotated.linked].map((v) => v.column),
    sorting,
    filters,
    hiddenSpecs,
  );

  const visible = buildVisibleColumns(annotated, hiddenColumnIds);
  const visibleDef = createPTableDefV3({
    primaryJoinType,
    primary: primaryEntries,
    secondary: buildSecondaryGroups(
      visible.direct.filter((c) => !c.isPrimary),
      visible.linked,
    ),
    filters,
    sorting,
  });
  const visibleHandle = ctx.createPTableV2(visibleDef);

  return {
    sourceId: state.pTableParams.sourceId,
    fullTableHandle: fullHandle,
    fullPframeHandle: pframeHandle,
    visibleTableHandle: visibleHandle,
    defaultFilters: remapedDefaultFilters,
  } satisfies PlDataTableModel;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A column entry consumable by {@link createPlDataTableV3}.
 *
 * Most fields are optional with sensible defaults — for the common case
 * (a column from a workflow output, no linker path, primary), only `column`
 * needs to be specified and the rest are filled in.
 *
 * @see normalizeTableColumnVariant for the defaults applied at function entry.
 */
export type TableColumnVariant = {
  /** Column snapshot (id + spec + lazy data + dataStatus). Required. */
  readonly column: ColumnSnapshot<DiscoveredPColumnId | PObjectId>;
  /**
   * Linker path traversed to reach this column from an anchor. Empty for
   * direct columns (the typical case).
   * @default []
   */
  readonly path?: { linker: ColumnSnapshot<PObjectId> }[];
  /**
   * Match qualifications collected during anchored discovery — used by the
   * join engine to disambiguate when a column matches an anchor in multiple ways.
   * @default { forHit: [], forQueries: {} }
   */
  readonly qualifications?: MatchQualifications;
  /**
   * Original (pre-discovery) PObjectId, used to remap filter/sorting column
   * references the user passed in via `options.filters` / `options.sorting`.
   * @default column.id (cast to PObjectId)
   */
  readonly originalId?: PObjectId;
  /**
   * Whether this column is part of the primary join key set. Primary columns
   * drive row generation; non-primary columns are joined on top.
   * @default true
   */
  readonly isPrimary?: boolean;
};

/** Internal shape after default-filling — every field guaranteed present. */
type NormalizedTableColumnVariant = Required<TableColumnVariant>;

type SplitDiscoveredColumns = {
  readonly direct: NormalizedTableColumnVariant[];
  readonly linked: NormalizedTableColumnVariant[];
};

type AnnotatedColumnGroups = {
  readonly direct: NormalizedTableColumnVariant[];
  readonly linked: NormalizedTableColumnVariant[];
};

type VisibleColumns = {
  readonly direct: NormalizedTableColumnVariant[];
  readonly linked: NormalizedTableColumnVariant[];
};

// ---------------------------------------------------------------------------
// Column resolution: primaryColumns + enrichFromPool, or columns
// ---------------------------------------------------------------------------

/**
 * Resolve `options.primaryColumns` / `options.columns` / `options.enrichFromPool`
 * into a single flat list of normalized variants.
 *
 * Returns `undefined` if no input was provided or if everything resolved to empty.
 */
function resolveColumns<A, U>(
  ctx: RenderCtxBase<A, U>,
  options: createPlDataTableOptionsV3,
): NormalizedTableColumnVariant[] | undefined {
  // Path A: simple-case sugar — primaryColumns + optional enrichFromPool.
  if (options.primaryColumns !== undefined) {
    const primary = normalizePrimaryColumns(options.primaryColumns);
    if (primary === undefined || primary.length === 0) return undefined;

    if (!options.enrichFromPool) return primary;

    const enrichment = normalizeEnrichmentConfig(options.enrichFromPool);
    const enriched = discoverEnrichmentColumns(ctx, primary, enrichment);
    return [...primary, ...enriched];
  }

  // Path B: advanced — columns is either a discovery config or pre-built variants.
  if (options.columns === undefined) return undefined;

  const variants = isPlainObject(options.columns)
    ? discoverTableColumnSnaphots(ctx, options.columns)
    : options.columns;

  if (isNil(variants)) return undefined;
  return variants.map(normalizeTableColumnVariant);
}

/**
 * Fill in defaults on a user-supplied `TableColumnVariant`. Existing values
 * pass through; missing optional fields receive the documented defaults.
 *
 * @internal Exposed for unit testing; not part of the stable public surface.
 */
export function normalizeTableColumnVariant(v: TableColumnVariant): NormalizedTableColumnVariant {
  return {
    column: v.column,
    path: v.path ?? [],
    qualifications: v.qualifications ?? { forHit: [], forQueries: {} },
    originalId: v.originalId ?? (v.column.id as PObjectId),
    isPrimary: v.isPrimary ?? true,
  };
}

/**
 * Normalize the three accepted shapes of `primaryColumns` into variant form.
 *
 *  - `TreeNodeAccessor` → `OutputColumnProvider` (preserves per-column
 *    `dataStatus` so the table can render partial data).
 *  - `PColumn[]` → `ArrayColumnProvider` (status derived from accessor readiness).
 *  - `TableColumnVariant[]` → variants with defaults filled in.
 *
 * All produced variants get `isPrimary: true` and an empty linker `path`.
 * Returns `undefined` only when input is `undefined`; an empty array stays empty.
 */
function normalizePrimaryColumns(
  input: NonNullable<createPlDataTableOptionsV3["primaryColumns"]>,
): NormalizedTableColumnVariant[] | undefined {
  if (input instanceof TreeNodeAccessor) {
    return new OutputColumnProvider(input).getAllColumns().map(snapshotToPrimaryVariant);
  }

  if (!Array.isArray(input)) {
    throw new Error(
      "createPlDataTableV3: `primaryColumns` must be a TreeNodeAccessor, a PColumn[], or a TableColumnVariant[].",
    );
  }

  if (input.length === 0) return [];

  // Distinguish PColumn[] from TableColumnVariant[] by shape: variants
  // wrap their column under a `column` field; PColumns expose `id`/`spec`/`data` directly.
  const first = input[0] as object;
  if ("column" in first) {
    return (input as TableColumnVariant[]).map(normalizeTableColumnVariant);
  }
  return new ArrayColumnProvider(input as PColumn<PColumnDataUniversal>[])
    .getAllColumns()
    .map(snapshotToPrimaryVariant);
}

/** Wrap a `ColumnSnapshot` as a primary variant (no linker path, no qualifications). */
function snapshotToPrimaryVariant(snap: ColumnSnapshot<PObjectId>): NormalizedTableColumnVariant {
  return {
    column: snap,
    path: [],
    qualifications: { forHit: [], forQueries: {} },
    originalId: snap.id,
    isPrimary: true,
  };
}

/**
 * Coerce the various shorthand forms of `enrichFromPool` to a normalized
 * options object with all defaults filled in. Caller must have already
 * filtered out the falsy forms (`undefined`, `false`).
 *
 * @internal Exposed for unit testing; not part of the stable public surface.
 */
export function normalizeEnrichmentConfig(
  config: Exclude<NonNullable<createPlDataTableOptionsV3["enrichFromPool"]>, false>,
): Required<EnrichFromPoolOptions> {
  if (config === true) {
    return { visibility: "optional", exclude: [], maxHops: 4, mode: "enrichment" };
  }
  if (typeof config === "string") {
    return { visibility: config, exclude: [], maxHops: 4, mode: "enrichment" };
  }
  return {
    visibility: config.visibility ?? "optional",
    exclude: config.exclude ?? [],
    maxHops: config.maxHops ?? 4,
    mode: config.mode ?? "enrichment",
  };
}

/**
 * Discover columns in the result pool joinable to the primary columns and
 * convert them into non-primary variants with the configured default visibility.
 *
 * Source order is `[primary, ...ctx providers]`; the builder dedups by
 * `NativePObjectId` (first source wins), so primary columns naturally take
 * precedence over their pool-published siblings (block published columns
 * via `exports`). Discovery results are then post-filtered to drop any
 * variant whose original ID matches a primary column — that case happens
 * when a primary column also matches the enrichment selector.
 *
 * The configured visibility is applied as a `pl7.app/table/visibility`
 * annotation on each enriched column's spec. User-supplied
 * `displayOptions.visibility` rules still take precedence per the usual
 * first-match-wins semantics in `evaluateRules`.
 *
 * Failure handling: any error thrown by the underlying spec-frame engine
 * (e.g. WASM traps in `pframes-rs-wasm` when the result pool produces an
 * unsupported shape) is caught here. The function logs the failure and
 * returns an empty enrichment list, so the table still renders with its
 * primary columns. The block is responsible for surfacing the warning to
 * the user if needed.
 */
function discoverEnrichmentColumns<A, U>(
  ctx: RenderCtxBase<A, U>,
  primary: NormalizedTableColumnVariant[],
  config: Required<EnrichFromPoolOptions>,
): NormalizedTableColumnVariant[] {
  const primarySnapshots = primary.map((v) => v.column as ColumnSnapshot<PObjectId>);
  const primaryIds = new Set(primarySnapshots.map((s) => s.id));

  let collection: ReturnType<ColumnCollectionBuilder["build"]> | undefined;
  try {
    const builder = new ColumnCollectionBuilder(ctx.getService("pframeSpec"))
      .addSource(new SnapshotColumnProvider(primarySnapshots))
      .addSources(collectCtxColumnSnapshotProviders(ctx));

    // One anchor entry per primary column — discovery satisfies queries via any
    // anchor, so any pool column joinable to *any* primary axis is reachable.
    const anchors = Object.fromEntries(primary.map((v, i) => [`primary_${i}`, v.column.id]));

    collection = builder.build({ anchors });
    if (collection === undefined) return [];

    const variants = collection.findColumnVariants({
      mode: config.mode,
      maxHops: config.maxHops,
      exclude: config.exclude,
    });

    return variants
      .filter((v) => !primaryIds.has(v.column.id))
      .map((v) => enrichmentVariantFromMatch(v, config.visibility));
  } catch (err) {
    // Discovery failed — most commonly a WASM trap in pframes-rs-wasm when
    // the column set changes between evaluations. Degrade gracefully: skip
    // enrichment and render the table with primary columns only.
    console.warn(
      "createPlDataTableV3: enrichFromPool discovery failed, falling back to primary-only",
      err,
    );
    return [];
  } finally {
    collection?.dispose();
  }
}

/**
 * Convert a discovered `ColumnVariant` into our normalized form, applying the
 * configured default visibility as an annotation on the spec.
 */
function enrichmentVariantFromMatch(
  v: ColumnVariant<PObjectId>,
  visibility: Required<EnrichFromPoolOptions>["visibility"],
): NormalizedTableColumnVariant {
  const discoveredId = createDiscoveredPColumnId({
    column: v.column.id,
    path: v.path.map((s) => ({ type: "linker" as const, column: s.linker.id })),
    columnQualifications: v.qualifications.forHit,
    queriesQualifications: v.qualifications.forQueries,
  });
  return {
    column: {
      id: discoveredId,
      spec: withVisibilityAnnotation(v.column.spec, visibility),
      data: v.column.data,
      dataStatus: v.column.dataStatus,
    },
    path: v.path,
    qualifications: v.qualifications,
    originalId: v.column.id,
    isPrimary: false,
  };
}

/** Set the table-visibility annotation on a column spec without mutating the input. */
function withVisibilityAnnotation(
  spec: PColumnSpec,
  visibility: Required<EnrichFromPoolOptions>["visibility"],
): PColumnSpec {
  return {
    ...spec,
    annotations: {
      ...spec.annotations,
      [Annotation.Table.Visibility]: visibility,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal pipeline (split / annotate / build defs / etc.)
// ---------------------------------------------------------------------------

/** Split discovered columns into direct (no linker path) and linked (with linker path). */
function splitDiscoveredColumns(columns: NormalizedTableColumnVariant[]): SplitDiscoveredColumns {
  const direct = columns.filter((dc) => dc.path.length === 0);
  const linked = columns.filter((dc) => dc.path.length > 0);
  return { direct, linked };
}

/** All linker snapshots across the given linked columns, deduped by id. */
function collectLinkerSnapshots(
  linked: NormalizedTableColumnVariant[],
): ColumnSnapshot<PObjectId>[] {
  return uniqueBy(
    linked.flatMap((lc) => lc.path.map((s) => s.linker)),
    (c) => c.id,
  );
}

/**
 * Annotate all column groups with derived labels and display-rule annotations.
 * Evaluates `displayOptions` rules against all discovered columns (direct,
 * linked, labels, linkers) and writes the winning visibility/priority into
 * column annotations via `withTableVisualAnnotations`.
 */
function annotateColumnGroups(params: {
  direct: NormalizedTableColumnVariant[];
  linked: NormalizedTableColumnVariant[];
  derivedLabels: Record<string, string>;
  derivedTooltips: Record<string, string>;
  displayOptions?: ColumnsDisplayOptions;
  pframeSpec: PFrameSpecDriver;
}): AnnotatedColumnGroups {
  const { direct, linked, derivedLabels, derivedTooltips, displayOptions, pframeSpec } = params;

  // Evaluate user rules over the union of all columns (direct, linked, linkers)
  // since rules can target any discovered column regardless of role.
  const allColumnsForRules = [
    ...direct.map((v) => v.column),
    ...linked.map((v) => v.column),
    ...collectLinkerSnapshots(linked),
  ];
  const visibilityByColId = evaluateRules(
    displayOptions?.visibility ?? [],
    allColumnsForRules,
    pframeSpec,
  );
  const orderByColId = evaluateRules(
    displayOptions?.ordering ?? [],
    allColumnsForRules,
    pframeSpec,
  );

  const directAnnotated = liftToVariantColumns(
    direct,
    flow(
      (cols) => withDataStatusAnnotations(cols),
      (cols) => withLabelAnnotations(derivedLabels, cols),
      (cols) => withInfoAnnotations(derivedTooltips, cols),
      (cols) => withTableVisualAnnotations(visibilityByColId, orderByColId, cols),
    ),
  );

  const linkedAnnotated = liftToVariantColumns(
    linked,
    flow(
      (cols) => withDataStatusAnnotations(cols),
      (cols) => withHidenAxesAnnotations(cols),
      (cols) => withLabelAnnotations(derivedLabels, cols),
      (cols) => withInfoAnnotations(derivedTooltips, cols),
      (cols) => withTableVisualAnnotations(visibilityByColId, orderByColId, cols),
    ),
  ).map((lc) => ({ ...lc, path: annotateLinkerPath(derivedLabels, lc.path) }));

  return {
    direct: directAnnotated,
    linked: linkedAnnotated,
  };
}

/** Lift a snapshot-array transform so it runs on the inner `column` of each variant. */
function liftToVariantColumns<
  V extends { readonly column: ColumnSnapshot<DiscoveredPColumnId | PObjectId> },
>(
  variants: V[],
  fn: (
    cols: ColumnSnapshot<DiscoveredPColumnId | PObjectId>[],
  ) => ColumnSnapshot<DiscoveredPColumnId | PObjectId>[],
): V[] {
  const cols = fn(variants.map((v) => v.column));
  if (cols.length !== variants.length)
    throw new Error(
      `liftToVariantColumns: fn must preserve array length (got ${cols.length}, expected ${variants.length})`,
    );
  return variants.map((v, i) => ({ ...v, column: cols[i] }));
}

/**
 * Annotate the linker steps of a linked column's path with derived labels and
 * mark their axes as hidden — linkers participate in the join but their cells
 * are not displayed in the table.
 */
function annotateLinkerPath(
  derivedLabels: Record<string, string>,
  path: NormalizedTableColumnVariant["path"],
): NormalizedTableColumnVariant["path"] {
  if (path.length === 0) return path;
  const annotatedLinkers = withHidenAxesAnnotations(
    withLabelAnnotations(
      derivedLabels,
      path.map((s) => s.linker),
    ),
  );
  return path.map((s, i) => ({ ...s, linker: annotatedLinkers[i] }));
}

/**
 * Build an index of all valid column IDs (axes + columns) for filter/sorting validation.
 * Returns a predicate that takes a canonicalized `PTableColumnId` JSON string
 * and reports whether it refers to a column or axis present in the discovered set.
 */
function createColumnValidationById(
  fullColumns: { readonly id: PObjectId | DiscoveredPColumnId; readonly spec: PColumnSpec }[],
) {
  const axisIds = uniqueBy(
    fullColumns.flatMap((c) => c.spec.axesSpec.map(getAxisId)),
    (a) => canonicalizeJson<AxisId>(a),
  );

  const allIds: PTableColumnId[] = [
    ...axisIds.map((a) => ({ type: "axis", id: a }) satisfies PTableColumnIdAxis),
    ...fullColumns.map((c) => ({ type: "column", id: c.id }) satisfies PTableColumnIdColumn),
  ];

  const validIdSet = new Set(allIds.map((c) => canonicalizeJson<PTableColumnId>(c)));

  return (id: string): boolean => {
    return validIdSet.has(id as CanonicalizedJson<PTableColumnId>);
  };
}

/** Drop filter leaves whose column references are not available in the table. */
function filterFilters(
  filters: Nil | PlDataTableFilters,
  isValidColumnId: (id: string) => boolean,
): Nil | PlDataTableFilters {
  if (isNil(filters)) return filters;

  const isLeafValid = (leaf: PlDataTableFilterSpecLeaf): boolean => {
    if (leaf.type === undefined) return true;
    if ("column" in leaf && !isValidColumnId(leaf.column)) return false;
    if ("rhs" in leaf && !isValidColumnId(leaf.rhs)) return false;
    return true;
  };

  const prune = (node: PlDataTableFilterNode): Nil | PlDataTableFilterNode => {
    if (node.type === "and" || node.type === "or") {
      const kept = node.filters
        .map((f) => prune(f))
        .filter((f): f is PlDataTableFilterNode => !isNil(f));
      return { type: node.type, filters: kept };
    }
    if (node.type === "not") {
      const inner = prune(node.filter);
      return isNil(inner) ? undefined : { type: "not", filter: inner };
    }
    return isLeafValid(node) ? node : undefined;
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

/** Pick user sorting from state if non-empty, otherwise fall back to options default. */
function resolveSorting(
  userSorting: PTableSorting[],
  defaultSorting: Nil | PTableSorting[],
): PTableSorting[] {
  return (isEmpty(userSorting) ? defaultSorting : userSorting) ?? [];
}

/** Drop sorting entries whose column is not available in the table. */
function filterSorting(
  sorting: PTableSorting[],
  isValidColumnId: (id: string) => boolean,
): PTableSorting[] {
  return sorting.filter((s) => isValidColumnId(canonicalizeJson<PTableColumnId>(s.column)));
}

/**
 * Build the secondary-group list passed to `createPTableDefV3`. Each direct
 * non-primary column becomes a single-entry group; each linked column becomes
 * a multi-entry group (linker steps followed by the hit column). Primary
 * qualifications travel along to disambiguate the join.
 */
function buildSecondaryGroups(
  direct: NormalizedTableColumnVariant[],
  linked: NormalizedTableColumnVariant[],
): SecondaryGroup<undefined | PColumnDataUniversal>[] {
  return [
    ...direct.map(
      (c): SecondaryGroup<undefined | PColumnDataUniversal> => ({
        entries: [{ column: resolveSnapshot(c.column), qualifications: c.qualifications.forHit }],
        primaryQualifications: c.qualifications.forQueries,
      }),
    ),
    ...linked.map(
      (lc): SecondaryGroup<undefined | PColumnDataUniversal> => ({
        entries: [
          ...lc.path.map((s) => ({
            column: resolveSnapshot(s.linker),
          })),
          { column: resolveSnapshot(lc.column), qualifications: lc.qualifications.forHit },
        ],
        primaryQualifications: lc.qualifications.forQueries,
      }),
    ),
  ];
}

/**
 * Determine which columns should be hidden in the visible-table handle.
 *
 * Two sources contribute:
 *  - Always-hidden columns (annotation `Visibility = 'hidden'`).
 *  - Optionally-hidden columns: either the user's saved selection
 *    (`hiddenSpecs` from `tableState.pTableParams.hiddenColIds`) when present,
 *    or the default set (annotation `Visibility = 'optional'`) when not.
 *
 * Columns referenced by active sort or filter are *un-hidden* — they must
 * remain in the join for the predicate to evaluate.
 */
function computeHiddenColumns(
  columns: { readonly id: PObjectId | DiscoveredPColumnId; readonly spec: PColumnSpec }[],
  sorting: Nil | PTableSorting[],
  filters: Nil | PlDataTableFilters,
  hiddenSpecs: Nil | PTableColumnId[],
): Set<PObjectId | DiscoveredPColumnId> {
  const alwaysHidden = columns.filter((c) => isColumnHidden(c.spec)).map((c) => c.id);
  const optionalHidden = !isNil(hiddenSpecs)
    ? hiddenSpecs.filter((s): s is PTableColumnIdColumn => s.type === "column").map((s) => s.id)
    : columns.filter((c) => isColumnOptional(c.spec)).map((c) => c.id);
  const initial = [...alwaysHidden, ...optionalHidden];
  const preserved = collectPreservedColumnIds(sorting, filters);

  return new Set(initial.filter((id) => !preserved.has(id as PObjectId)));
}

/** Collect IDs of columns that must remain visible (sorted, filtered). */
function collectPreservedColumnIds(
  sorting: Nil | PTableSorting[],
  filters: Nil | PlDataTableFilters,
): Set<PObjectId> {
  const sortedIds = (sorting ?? [])
    .map((s) => s.column)
    .filter((c): c is PTableColumnIdColumn => c.type === "column")
    .map((c) => c.id);

  const filterIds = !isNil(filters)
    ? collectFilterSpecColumns(filters).flatMap((c) => {
        const obj = parseJson(c);
        return obj.type === "column" ? [obj.id] : [];
      })
    : [];

  return new Set<PObjectId>([...sortedIds, ...filterIds]);
}

/** Filter annotated columns to only visible ones. */
function buildVisibleColumns(
  annotated: AnnotatedColumnGroups,
  hiddenColumns: Set<PObjectId | DiscoveredPColumnId>,
): VisibleColumns {
  const direct = annotated.direct.filter((c) => !hiddenColumns.has(c.column.id));
  const linked = annotated.linked.filter((c) => !hiddenColumns.has(c.column.id));
  return { direct, linked };
}

/** Resolve a ColumnSnapshot to a PColumn with lazily-evaluated data. */
function resolveSnapshot(
  snap: ColumnSnapshot<PObjectId | DiscoveredPColumnId>,
): PColumn<undefined | PColumnDataUniversal> {
  return { id: snap.id as PObjectId, spec: snap.spec, data: snap.data?.get() };
}

/**
 * Remap column references in sorting entries from user-facing `originalId`s
 * to the post-discovery `DiscoveredPColumnId`s actually used inside the table.
 * Sorting entries referencing columns no longer in the discovered set are dropped.
 */
function remapSortingColumnIds(
  sorting: Nil | PTableSorting[],
  columns: NormalizedTableColumnVariant[],
): Nil | PTableSorting[] {
  return sorting?.flatMap((s) => {
    if (s.column.type === "axis") return [s]; // Axis references are unaffected by column ID remapping

    const id = s.column.id;
    const column = columns.find((c) => (c.originalId ?? c.column.id) === id);
    if (column === undefined) return [];

    return [
      {
        ...s,
        column: {
          type: "column" as const,
          id: column.column.id as PObjectId,
        },
      },
    ];
  });
}

type PlDataTableFilterNode = FilterSpecNode<PlDataTableFilterSpecLeaf>;

/**
 * Remap column references in a filter tree from user-facing `originalId`s
 * to the post-discovery `DiscoveredPColumnId`s actually used inside the table.
 * Throws if a referenced column is not present in the discovered set —
 * filter validity is the caller's contract.
 */
function remapFilterColumnIds(
  filters: Nil | PlDataTableFilters,
  columns: NormalizedTableColumnVariant[],
): Nil | PlDataTableFilters {
  if (isNil(filters)) return filters;

  const map = (
    tableColumnId: CanonicalizedJson<PTableColumnId>,
  ): CanonicalizedJson<PTableColumnId> => {
    const parsed = parseJson<PTableColumnId>(tableColumnId);
    if (parsed.type === "axis") return tableColumnId; // Axis references are unaffected by column ID remapping

    const originalId = parsed.id;
    const column =
      columns.find((c) => (c.originalId ?? c.column.id) === originalId) ??
      throwError(`Column ID "${parsed.id}" in filters does not match any discovered column`);

    return canonicalizeJson<PTableColumnId>({
      type: "column",
      id: column.column.id as PObjectId,
    });
  };

  return traverseFilterSpec(filters, {
    leaf: (leaf): PlDataTableFilterNode => {
      if (leaf.type === undefined) return leaf;
      const result = { ...leaf };
      if ("column" in result) result.column = map(result.column);
      if ("rhs" in result) result.rhs = map(result.rhs);
      return result;
    },
    and: (results): PlDataTableFilterNode => ({ type: "and", filters: results }),
    or: (results): PlDataTableFilterNode => ({ type: "or", filters: results }),
    not: (result): PlDataTableFilterNode => ({ type: "not", filter: result }),
  }) as PlDataTableFilters;
}
