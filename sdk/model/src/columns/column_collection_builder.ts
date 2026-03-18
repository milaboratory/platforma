import type {
  NativePObjectId,
  PColumnSpec,
  PlRef,
  PObjectId,
  SingleAxisSelector,
  SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import { AnchoredIdDeriver, deriveNativeId, isPlRef } from "@milaboratories/pl-model-common";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import type { ColumnSelectorInput } from "./column_selector";
import { normalizeSelectors } from "./column_selector";
import type { ColumnSelector, AxisSelector, StringMatcher } from "./column_selector";
import { TreeNodeAccessor } from "../render/accessor";
import type { ColumnSnapshot } from "./column_snapshot";
import {
  createColumnSnapshot,
  createComputingColumnData,
  createReadyColumnData,
} from "./column_snapshot";
import type { ColumnSnapshotProvider, ColumnSource } from "./column_snapshot_provider";
import { ArrayColumnProvider, toColumnSnapshotProvider } from "./column_snapshot_provider";

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

// --- AnchoredColumnCollection ---

/** Axis-aware column collection with anchored identity derivation. */
export interface AnchoredColumnCollection {
  /** Point lookup by anchored ID. */
  getColumn(id: SUniversalPColumnId): undefined | ColumnSnapshot<SUniversalPColumnId>;

  /** Axis-aware column discovery. */
  findColumns(options?: AnchoredFindColumnsOptions): ColumnMatch[];
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

/** Qualification applied to a single axis to make it compatible during integration. */
export interface AxisQualification {
  /** Axis selector identifying which axis is qualified. */
  readonly axis: SingleAxisSelector;
  /** Additional context domain entries applied to the axis. */
  readonly contextDomain: Record<string, string>;
}

/** Qualifications needed for both query (already-integrated) columns and the hit column. */
export interface MatchQualifications {
  /** Qualifications for each query (already-integrated) column set. */
  readonly forQueries: AxisQualification[][];
  /** Qualifications for the hit column. */
  readonly forHit: AxisQualification[];
}

/** A single mapping variant describing how a hit column can be integrated. */
export interface MatchVariant {
  /** Full qualifications needed for integration. */
  readonly qualifications: MatchQualifications;
  /** Distinctive (minimal) qualifications needed for integration. */
  readonly distinctiveQualifications: MatchQualifications;
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
  private readonly providers: ColumnSnapshotProvider[] = [];
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
      this.providers.push(toColumnSnapshotProvider(source));
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
      const anchorSpecs = resolveAnchorSpecs(options.anchors, columnMap);
      const idDeriver = new AnchoredIdDeriver(anchorSpecs);

      return new AnchoredColumnCollectionImpl(this.specFrameCtx, {
        columns: columnMap,
        idDeriver,
        anchorSpecs,
        markUnstable: this.markUnstable,
        columnListComplete: allowPartial ? allComplete : false,
      });
    } else {
      return new ColumnCollectionImpl(this.specFrameCtx, {
        columns: columnMap,
        markUnstable: this.markUnstable,
        columnListComplete: allowPartial ? allComplete : false,
      });
    }
  }

  /**
   * Collect all columns from all providers, dedup by NativePObjectId.
   * First source wins.
   */
  private collectColumns(): Map<PObjectId, ColumnSnapshot<PObjectId>> {
    const seen = new Set<NativePObjectId>();
    const result = new Map<PObjectId, ColumnSnapshot<PObjectId>>();

    for (const provider of this.providers) {
      const columns = provider.getAllColumns();
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

  findColumns(options?: FindColumnsOptions): ColumnSnapshot<PObjectId>[] {
    const columnFilter = options?.include ? toMultiColumnSelectors(options.include) : [];

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

    if (options?.exclude) {
      throw new Error("Exclude filter is not yet implemented for plain ColumnCollection");
    }

    return results;
  }

  private toSnapshot(col: ColumnSnapshot<PObjectId>): ColumnSnapshot<PObjectId> {
    return remapSnapshot(col.id, col, this.markUnstable);
  }
}

// --- AnchoredColumnCollectionImpl ---

interface AnchoredColumnCollectionImplOptions extends ColumnCollectionImplOptions {
  readonly idDeriver: AnchoredIdDeriver;
  readonly anchorSpecs: Record<string, PColumnSpec>;
}

class AnchoredColumnCollectionImpl implements AnchoredColumnCollection {
  private readonly markUnstable: () => void;
  private readonly columns: Map<PObjectId, ColumnSnapshot<PObjectId>>;
  private readonly idDeriver: AnchoredIdDeriver;
  private readonly specFrameHandle: string;
  private readonly anchorAxes: PFrameInternal.ColumnAxesWithQualifications[];
  /** Reverse lookup: SUniversalPColumnId → PObjectId */
  private readonly idToOriginal: Map<SUniversalPColumnId, PObjectId>;
  public readonly columnListComplete: boolean;

  constructor(
    private readonly ctx: SpecFrameCtx,
    options: AnchoredColumnCollectionImplOptions,
  ) {
    this.markUnstable = options.markUnstable ?? (() => {});
    this.columns = options.columns;
    this.idDeriver = options.idDeriver;
    this.columnListComplete = options.columnListComplete ?? false;

    // Create spec frame from all collected columns
    this.specFrameHandle = this.ctx.createSpecFrame(
      this.columns
        .entries()
        .reduce((acc, [id, col]) => ((acc[id] = col.spec), acc), {} as Record<string, PColumnSpec>),
    );

    // Build anchor axes for discovery requests
    this.anchorAxes = Object.values(options.anchorSpecs).map((spec) => ({
      axesSpec: spec.axesSpec,
      qualifications: [],
    }));

    // Build reverse lookup map
    this.idToOriginal = new Map(
      this.columns.entries().map(([id, col]) => [this.idDeriver.deriveS(col.spec), id] as const),
    );
  }

  getColumn(id: SUniversalPColumnId): undefined | ColumnSnapshot<SUniversalPColumnId> {
    const origId = this.idToOriginal.get(id);
    if (origId === undefined) return undefined;
    const col = this.columns.get(origId);
    if (col === undefined) return undefined;
    return this.toSnapshot(id, col);
  }

  findColumns(options?: AnchoredFindColumnsOptions): ColumnMatch[] {
    const mode = options?.mode ?? "enrichment";
    const constraints = matchingModeToConstraints(mode);
    const columnFilter = options?.include ? toMultiColumnSelectors(options.include) : [];

    const response = this.ctx.specFrameDiscoverColumns(this.specFrameHandle, {
      columnFilter,
      constraints,
      axes: this.anchorAxes,
    });

    // Map hits back to ColumnMatch entries
    let results = response.hits
      .map((hit) => {
        const origId = hit.hit.columnId as PObjectId;
        const col = this.columns.get(origId);
        if (!col) return undefined;
        const universalId = this.idDeriver.deriveS(col.spec);
        return {
          column: this.toSnapshot(universalId, col),
          originalId: origId,
          variants: hit.mappingVariants.map(
            (v): MatchVariant => ({
              qualifications: v.qualifications,
              distinctiveQualifications: v.distinctiveQualifications,
            }),
          ),
        } satisfies ColumnMatch;
      })
      .filter((m): m is ColumnMatch => m !== undefined);

    if (options?.exclude) {
      throw new Error("Exclude filter is not yet implemented for AnchoredColumnCollection");
    }

    return results;
  }

  private toSnapshot(
    universalId: SUniversalPColumnId,
    col: ColumnSnapshot<PObjectId>,
  ): ColumnSnapshot<SUniversalPColumnId> {
    return remapSnapshot(universalId, col, this.markUnstable);
  }
}

// --- Shared snapshot helpers ---

/** Create a new snapshot with a different ID, wiring up data accessors with instability tracking. */
function remapSnapshot<Id extends PObjectId>(
  id: Id,
  col: ColumnSnapshot<PObjectId>,
  markUnstable: () => void,
): ColumnSnapshot<Id> {
  let data;
  switch (col.dataStatus) {
    case "ready":
      data = createReadyColumnData(() => col.data?.get());
      break;
    case "computing":
      data = createComputingColumnData(markUnstable);
      break;
    case "absent":
      data = undefined;
      break;
  }
  return createColumnSnapshot(id, col.spec, col.dataStatus, data);
}

// --- Selector conversion helpers ---

function convertMatcherArray(arr: StringMatcher[]): PFrameInternal.StringMatcher[] {
  return arr;
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

// --- Anchor resolution ---

/**
 * Resolve each anchor value to a PColumnSpec.
 * - PColumnSpec: used directly
 * - PObjectId (string): looked up in the collected column map
 * - PlRef: not supported at this level — caller must resolve before building
 */
function resolveAnchorSpecs(
  anchors: Record<string, PlRef | PObjectId | PColumnSpec>,
  columnMap: Map<PObjectId, ColumnSnapshot<PObjectId>>,
): Record<string, PColumnSpec> {
  const result: Record<string, PColumnSpec> = {};
  for (const [key, anchor] of Object.entries(anchors)) {
    if (typeof anchor === "string") {
      // PObjectId — look up in collected columns
      const col = columnMap.get(anchor as PObjectId);
      if (!col) throw new Error(`Anchor "${key}": column with id "${anchor}" not found in sources`);
      result[key] = col.spec;
    } else if (isPlRef(anchor)) {
      throw new Error(
        `Anchor "${key}": PlRef anchors must be resolved to PColumnSpec before building. ` +
          `Use the column's spec directly or pass its PObjectId.`,
      );
    } else {
      // PColumnSpec
      result[key] = anchor;
    }
  }
  return result;
}

// --- MatchingMode → DiscoverColumnsConstraints ---

function matchingModeToConstraints(mode: MatchingMode): PFrameInternal.DiscoverColumnsConstraints {
  switch (mode) {
    case "enrichment":
      return {
        allowFloatingSourceAxes: true,
        allowFloatingHitAxes: true,
        allowSourceQualifications: false,
        allowHitQualifications: false,
      };
    case "related":
      return {
        allowFloatingSourceAxes: true,
        allowFloatingHitAxes: true,
        allowSourceQualifications: true,
        allowHitQualifications: true,
      };
    case "exact":
      return {
        allowFloatingSourceAxes: false,
        allowFloatingHitAxes: false,
        allowSourceQualifications: false,
        allowHitQualifications: false,
      };
  }
}
