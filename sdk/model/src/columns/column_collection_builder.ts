import type {
  NativePObjectId,
  PColumnSpec,
  PlRef,
  PObjectId,
  SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import { deriveNativeId } from "@milaboratories/pl-model-common";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import type { ColumnSelectorInput } from "./column_selector";
import { normalizeSelectors, selectorsToPredicate } from "./column_selector";
import type { ColumnSelector, AxisSelector, StringMatcher } from "./column_selector";
import { TreeNodeAccessor } from "../render/accessor";
import type { ColumnSnapshot } from "./column_snapshot";
import {
  createColumnSnapshot,
  createComputingColumnData,
  createReadyColumnData,
} from "./column_snapshot";
import type { ColumnProvider, ColumnSource } from "./column_provider";
import { ArrayColumnProvider, toColumnProvider } from "./column_provider";

import type { GlobalCfgRenderCtxMethods } from "../render/internal";

/** Subset of render context methods needed for spec frame operations. */
type SpecFrameCtx = Pick<
  GlobalCfgRenderCtxMethods,
  "createSpecFrame" | "specFrameDiscoverColumns" | "specFrameDispose"
>;

// --- FindColumnsOptions ---

/** Options for plain collection findColumns. */
export interface FindColumnsOptions {
  /** Include columns matching these selectors. If omitted, includes all columns. */
  include?: ColumnSelectorInput;
  /** Exclude columns matching these selectors. */
  exclude?: ColumnSelectorInput;
}

// --- ColumnCollection ---

/** Plain collection — no axis context, selector-based filtering only. */
export interface ColumnCollection {
  /** Point lookup by provider-native ID. */
  getColumn(id: PObjectId): undefined | ColumnSnapshot<PObjectId>;

  /** Find columns matching selectors. Returns flat list of snapshots.
   *  No axis compatibility matching, no linker traversal.
   *  Never returns undefined — the "not ready" state was absorbed by the builder. */
  findColumns(options?: FindColumnsOptions): ColumnSnapshot<PObjectId>[];
}

// --- AnchoredColumnCollection (stub — full implementation in Step 7) ---

/** @TODO Step 7: full axis-aware discovery via pSpecDriver.discoverColumns */
export interface AnchoredColumnCollection {
  /** Point lookup by anchored ID. */
  getColumn(id: SUniversalPColumnId): undefined | ColumnSnapshot<SUniversalPColumnId>;

  /** Axis-aware column discovery. */
  findColumns(opts?: AnchoredFindColumnsOptions): ColumnMatch[];
}

/** Controls axis matching behavior for anchored discovery. */
export type MatchingMode = "enrichment" | "related" | "exact";

/** Options for anchored collection findColumns. */
export interface AnchoredFindColumnsOptions extends FindColumnsOptions {
  /** Controls axis matching behavior. Default: 'enrichment'. */
  mode?: MatchingMode;
  /** Maximum linker hops for cross-domain discovery (0 = direct only, default: 4). */
  maxLinkerHops?: number;
}

/** Result of anchored discovery — column snapshot + routing info. */
export interface ColumnMatch {
  /** Column snapshot with anchored SUniversalPColumnId. */
  readonly column: ColumnSnapshot<SUniversalPColumnId>;
  /** Provider-native ID — for lookups back to the source provider. */
  readonly originalId: PObjectId;
  /** Match variants — different paths/qualifications that reach this column. */
  readonly variants: MatchVariant[];
}

/** @TODO: mirror Phase 3 discoverColumns response structure */
export interface MatchVariant {
  // Placeholder — will be populated in Step 7 / M2
}

// --- Build options ---

export interface BuildOptions {
  allowPartialColumnList?: true;
}

export interface AnchoredBuildOptions extends BuildOptions {
  anchors: Record<string, PlRef | PObjectId | PColumnSpec>;
}

// --- ColumnCollectionBuilder ---

export interface ColumnCollectionBuilderOptions {
  /** Callback to mark the render context unstable.
   *  Used when constructing ColumnData active objects for computing columns. */
  readonly markUnstable?: () => void;
}

/**
 * Mutable builder that accumulates column sources, then produces
 * a ColumnCollection (plain) or AnchoredColumnCollection (with anchors).
 *
 * Each output lambda creates its own builder — a constraint of the
 * computable framework where each output tracks its own dependencies.
 */
export class ColumnCollectionBuilder {
  private readonly providers: ColumnProvider[] = [];
  private readonly markUnstable?: () => void;

  constructor(
    private readonly specFrameCtx: SpecFrameCtx,
    options: ColumnCollectionBuilderOptions = {},
  ) {
    this.markUnstable = options.markUnstable;
  }

  /**
   * Register a column source. Sources added first take precedence for dedup.
   * Does NOT accept undefined — if a source isn't available yet,
   * the caller should return undefined from the output lambda.
   */
  addSource(source: ColumnSource | TreeNodeAccessor): this {
    if (source instanceof TreeNodeAccessor) {
      const columns = source.getPColumns();
      if (columns) this.providers.push(new ArrayColumnProvider(columns));
    } else {
      this.providers.push(toColumnProvider(source));
    }
    return this;
  }

  addSources(sources: (ColumnSource | TreeNodeAccessor)[]): this {
    for (const source of sources) {
      this.addSource(source);
    }
    return this;
  }

  /** Plain collection — selector-based filtering, PObjectId namespace. */
  build(): undefined | ColumnCollection;
  build(options: {
    allowPartialColumnList: true;
  }): ColumnCollection & { readonly columnListComplete: boolean };
  /** Anchored collection — axis-aware discovery, SUniversalPColumnId namespace. */
  build(
    options: AnchoredBuildOptions & { allowPartialColumnList: true },
  ): AnchoredColumnCollection & { readonly columnListComplete: boolean };
  build(options: AnchoredBuildOptions): undefined | AnchoredColumnCollection;
  build(
    options?: BuildOptions | AnchoredBuildOptions,
  ):
    | undefined
    | ColumnCollection
    | AnchoredColumnCollection
    | (ColumnCollection & { readonly columnListComplete: boolean })
    | (AnchoredColumnCollection & { readonly columnListComplete: boolean }) {
    const allowPartial = options?.allowPartialColumnList === true;
    const hasAnchors = options !== undefined && "anchors" in options;

    // Check column list completeness
    const allComplete = this.providers.every((p) => p.isColumnListComplete());
    if (!allComplete && !allowPartial) return undefined;

    // Collect all columns, dedup by native ID (first source wins)
    const columnMap = this.collectColumns();

    if (hasAnchors) {
      // @TODO Step 7: anchored collection with axis-aware discovery
      throw new Error("AnchoredColumnCollection not yet implemented (Step 7)");
    }

    return new ColumnCollectionImpl(this.specFrameCtx, {
      columns: columnMap,
      markUnstable: this.markUnstable,
      columnListComplete: allowPartial ? allComplete : false,
    });
  }

  /**
   * Collect all columns from all providers, dedup by NativePObjectId.
   * First source wins.
   */
  private collectColumns(): Map<PObjectId, ColumnSnapshot<PObjectId>> {
    const seen = new Set<NativePObjectId>();
    const result = new Map<PObjectId, ColumnSnapshot<PObjectId>>();

    for (const provider of this.providers) {
      // Select all columns (pass-through predicate)
      const columns = provider.selectColumns(() => true);
      for (const col of columns) {
        const nativeId = deriveNativeId(col.spec);
        if (seen.has(nativeId)) continue;
        seen.add(nativeId);
        result.set(col.id, col);
      }
    }

    return result;
  }
}

// --- Permissive constraints for plain (non-anchored) filtering ---

const PLAIN_CONSTRAINTS: PFrameInternal.DiscoverColumnsConstraints = {
  allowFloatingSourceAxes: true,
  allowFloatingHitAxes: true,
  allowSourceQualifications: false,
  allowHitQualifications: false,
};

// --- ColumnCollectionImpl ---

interface ColumnCollectionImplOptions {
  readonly markUnstable?: () => void;
  readonly columns: Map<PObjectId, ColumnSnapshot<PObjectId>>;
  readonly columnListComplete?: boolean;
}

class ColumnCollectionImpl implements ColumnCollection {
  private readonly markUnstable: () => void;
  private readonly columns: Map<PObjectId, ColumnSnapshot<PObjectId>>;
  private readonly specFrameHandle: string;
  public readonly columnListComplete: boolean;

  constructor(
    private readonly ctx: SpecFrameCtx,
    options: ColumnCollectionImplOptions,
  ) {
    this.markUnstable = options.markUnstable ?? (() => {});
    this.columns = options.columns;
    this.columnListComplete = options.columnListComplete ?? false;
    this.specFrameHandle = this.ctx.createSpecFrame(
      this.columns
        .entries()
        .reduce((acc, [id, col]) => ((acc[id] = col.spec), acc), {} as Record<string, PColumnSpec>),
    );
  }

  getColumn(id: PObjectId): undefined | ColumnSnapshot<PObjectId> {
    const col = this.columns.get(id);
    if (col === undefined) return undefined;
    return this.toSnapshot(col);
  }

  findColumns(opts?: FindColumnsOptions): ColumnSnapshot<PObjectId>[] {
    const columnFilter = opts?.include ? toMultiColumnSelectors(opts.include) : [];

    const response = this.ctx.specFrameDiscoverColumns(this.specFrameHandle, {
      columnFilter,
      axes: [],
      constraints: PLAIN_CONSTRAINTS,
    });

    // Map hits back to snapshots
    let results = response.hits
      .map((hit) => this.columns.get(hit.hit.columnId as PObjectId))
      .filter((col): col is ColumnSnapshot<PObjectId> => col !== undefined)
      .map((col) => this.toSnapshot(col));

    // Apply exclude (post-filter — WASM doesn't have native exclude)
    if (opts?.exclude) {
      const excludePred = selectorsToPredicate(opts.exclude);
      results = results.filter((col) => !excludePred(col.spec));
    }

    return results;
  }

  private toSnapshot(col: ColumnSnapshot<PObjectId>): ColumnSnapshot<PObjectId> {
    let data;
    switch (col.dataStatus) {
      case "ready":
        data = createReadyColumnData(() => col.data?.get());
        break;
      case "computing":
        data = createComputingColumnData(this.markUnstable ?? (() => {}));
        break;
      case "absent":
        data = undefined;
        break;
    }
    return createColumnSnapshot(col.id, col.spec, col.dataStatus, data);
  }
}

function convertStringMatcher(m: StringMatcher): PFrameInternal.StringMatcher {
  if ("exact" in m) return { type: "exact", value: m.exact };
  return { type: "regex", value: m.regex };
}

function convertMatcherArray(arr: StringMatcher[]): PFrameInternal.StringMatcher[] {
  return arr.map(convertStringMatcher);
}

function convertMatcherMap(record: Record<string, StringMatcher[]>): PFrameInternal.MatcherMap {
  const result: PFrameInternal.MatcherMap = {};
  for (const [key, matchers] of Object.entries(record)) {
    result[key] = convertMatcherArray(matchers);
  }
  return result;
}

function convertAxisSelector(sel: AxisSelector): PFrameInternal.MultiAxisSelector {
  const result: PFrameInternal.MultiAxisSelector = {};
  if (sel.name) (result as any).name = convertMatcherArray(sel.name);
  if (sel.type) (result as any).type = sel.type;
  if (sel.domain) (result as any).domain = convertMatcherMap(sel.domain);
  if (sel.contextDomain) (result as any).contextDomain = convertMatcherMap(sel.contextDomain);
  if (sel.annotations) (result as any).annotations = convertMatcherMap(sel.annotations);
  return result;
}

function convertColumnSelector(sel: ColumnSelector): PFrameInternal.MultiColumnSelector {
  const result: PFrameInternal.MultiColumnSelector = {};
  if (sel.name) (result as any).name = convertMatcherArray(sel.name);
  if (sel.type) (result as any).type = sel.type;
  if (sel.domain) (result as any).domain = convertMatcherMap(sel.domain);
  if (sel.contextDomain) (result as any).contextDomain = convertMatcherMap(sel.contextDomain);
  if (sel.annotations) (result as any).annotations = convertMatcherMap(sel.annotations);
  if (sel.axes) (result as any).axes = sel.axes.map(convertAxisSelector);
  if (sel.partialAxesMatch !== undefined) (result as any).partialAxesMatch = sel.partialAxesMatch;
  return result;
}

/** Convert SDK ColumnSelectorInput to WASM MultiColumnSelector[]. */
function toMultiColumnSelectors(input: ColumnSelectorInput): PFrameInternal.MultiColumnSelector[] {
  return normalizeSelectors(input).map(convertColumnSelector);
}
