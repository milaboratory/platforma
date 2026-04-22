import type {
  AxisQualification,
  ColumnAxesWithQualifications,
  DiscoverColumnsConstraints,
  DiscoverColumnsRequest,
  DiscoverColumnsResponse,
  MultiColumnSelector,
  NativePObjectId,
  PColumnIdAndSpec,
  PColumnSpec,
  PObjectId,
  SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import {
  AnchoredIdDeriver,
  canonicalizeJson,
  deriveNativeId,
  getAxesId,
  isPColumnSpec,
} from "@milaboratories/pl-model-common";
import type { ColumnSelector, RelaxedColumnSelector } from "./column_selector";
import { convertColumnSelectorToMultiColumnSelector } from "./column_selector";
import { TreeNodeAccessor } from "../render/accessor";
import type { ColumnSnapshot } from "./column_snapshot";
import { createColumnSnapshot } from "./column_snapshot";
import type { ColumnSnapshotProvider, ColumnSource } from "./column_snapshot_provider";
import { ArrayColumnProvider, toColumnSnapshotProvider } from "./column_snapshot_provider";

import type { PFrameSpecDriver, PoolEntry, SpecFrameHandle } from "@milaboratories/pl-model-common";
import { throwError } from "@milaboratories/helpers";
import { uniqBy } from "es-toolkit";

// --- FindColumnsOptions ---

/** Options for plain collection findColumns. */
export interface FindColumnsOptions {
  /** Include columns matching these selectors. If omitted, includes all columns. */
  include?: ColumnSelector;
  /** Exclude columns matching these selectors. */
  exclude?: ColumnSelector;
}

// --- ColumnCollection ---

/** Plain collection — no axis context, selector-based filtering only. */
export interface ColumnCollection extends Disposable {
  /** Release the underlying spec frame WASM resource. */
  dispose(): void;

  /** Point lookup by provider-native ID. */
  getColumn(id: PObjectId): undefined | ColumnSnapshot<PObjectId>;

  /** Find columns matching selectors. Returns flat list of snapshots.
   *  No axis compatibility matching, no linker traversal.
   *  Never returns undefined — the "not ready" state was absorbed by the builder. */
  findColumns(options?: FindColumnsOptions): ColumnSnapshot<PObjectId>[];
}

// --- AnchoredColumnCollection ---

/** Axis-aware column collection with anchored identity derivation. */
export interface AnchoredColumnCollection extends Disposable {
  /** Release the underlying spec frame WASM resource. */
  dispose(): void;

  /** List of anchors used for discovery, with their resolved specs. */
  getAnchors(): Map<string, PColumnIdAndSpec>;

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
  maxHops?: number;
}

/** Result of anchored discovery — column snapshot + routing info. */
export interface ColumnMatch {
  /** Column snapshot with anchored SUniversalPColumnId. */
  readonly column: ColumnSnapshot<SUniversalPColumnId>;
  /** Provider-native ID — for lookups back to the source provider. */
  readonly originalId: PObjectId;
  /** Match variants — different paths/qualifications that reach this column. */
  readonly variants: MatchVariant[];
  /** Linker steps traversed to reach this hit; empty for direct matches. */
  readonly path: {
    linker: ColumnSnapshot<SUniversalPColumnId>;
    qualifications: AxisQualification[];
  }[];
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

export type AnchorEntry = PObjectId | PColumnSpec | RelaxedColumnSelector;

export interface AnchoredBuildOptions extends BuildOptions {
  anchors: Record<string, AnchorEntry>;
}

// --- ColumnCollectionBuilder ---

/**
 * Mutable builder that accumulates column sources, then produces
 * a ColumnCollection (plain) or AnchoredColumnCollection (with anchors).
 *
 * Each output lambda creates its own builder — a constraint of the
 * computable framework where each output tracks its own dependencies.
 */
export class ColumnCollectionBuilder {
  private readonly providers: ColumnSnapshotProvider[] = [];

  constructor(private readonly specDriver: PFrameSpecDriver) {}

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

    // Check column list completeness
    const allComplete = this.providers.every((p) => p.isColumnListComplete());
    if (!allComplete && !allowPartial) return undefined;

    // Collect all columns, dedup by native ID (first source wins)
    const columns = collectColumns(this.providers);
    const hasAnchors = options !== undefined && "anchors" in options;

    if (hasAnchors) {
      return new AnchoredColumnCollectionImpl(this.specDriver, {
        anchors: options.anchors,
        columns,
      });
    } else {
      return new ColumnCollectionImpl(this.specDriver, {
        columns,
      });
    }
  }
}

// --- ColumnCollectionImpl ---

interface ColumnCollectionImplOptions {
  readonly columns: ColumnSnapshot<PObjectId>[];
}

class ColumnCollectionImpl implements ColumnCollection, Disposable {
  private readonly columns: Map<PObjectId, ColumnSnapshot<PObjectId>>;
  private readonly specFrameEntry: PoolEntry<SpecFrameHandle>;

  constructor(
    private readonly specDriver: PFrameSpecDriver,
    options: ColumnCollectionImplOptions,
  ) {
    this.columns = new Map(options.columns.map((col) => [col.id, col]));
    this.specFrameEntry = this.specDriver.createSpecFrame(
      Object.fromEntries(options.columns.map((col) => [col.id, col.spec])),
    );
  }

  dispose(): void {
    this.specFrameEntry.unref();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  getColumn(id: PObjectId): undefined | ColumnSnapshot<PObjectId> {
    const col = this.columns.get(id);
    if (col === undefined) return undefined;
    return this.toSnapshot(col);
  }

  findColumns(options?: FindColumnsOptions): ColumnSnapshot<PObjectId>[] {
    const includeColumns = options?.include ? toMultiColumnSelectors(options.include) : undefined;
    const excludeColumns = options?.exclude ? toMultiColumnSelectors(options.exclude) : undefined;

    const response = this.specDriver.discoverColumns(this.specFrameEntry.key, {
      includeColumns,
      excludeColumns,
      axes: [],
      maxHops: 0,
      constraints: matchingModeToConstraints("enrichment"),
    });

    // Map hits back to snapshots
    const results = response.hits
      .map((hit) => this.columns.get(hit.hit.columnId as PObjectId))
      .filter((col): col is ColumnSnapshot<PObjectId> => col !== undefined)
      .map((col) => this.toSnapshot(col));

    return results;
  }

  private toSnapshot(col: ColumnSnapshot<PObjectId>): ColumnSnapshot<PObjectId> {
    return remapSnapshot(col.id, col);
  }
}

// --- AnchoredColumnCollectionImpl ---

interface AnchoredColumnCollectionImplOptions extends ColumnCollectionImplOptions {
  readonly anchors: Record<string, AnchorEntry>;
}

class AnchoredColumnCollectionImpl implements AnchoredColumnCollection, Disposable {
  private readonly anchorsMap: Map<string, PColumnIdAndSpec>;
  private readonly columnsMap: Map<PObjectId, ColumnSnapshot<PObjectId>>;

  private readonly idDeriver: AnchoredIdDeriver;
  private readonly uniqAnchorAxes: ColumnAxesWithQualifications[];
  private readonly idToOriginalIdMap: Map<SUniversalPColumnId, PObjectId>;
  private readonly specFrameEntry: PoolEntry<SpecFrameHandle>;

  constructor(
    private readonly specDriver: PFrameSpecDriver,
    options: AnchoredColumnCollectionImplOptions,
  ) {
    // Create spec frame from all collected columns
    this.specFrameEntry = this.specDriver.createSpecFrame(
      Object.fromEntries(options.columns.map((col) => [col.id, col.spec])),
    );
    this.columnsMap = new Map(options.columns.map((col) => [col.id, col]));
    this.anchorsMap = resolveAnchorMap(
      options.anchors,
      options.columns,
      this.specDriver.discoverColumns.bind(this.specDriver, this.specFrameEntry.key),
    );
    this.idDeriver = new AnchoredIdDeriver(
      Object.fromEntries(
        Array.from(this.anchorsMap.entries()).map(([k, v]) => [k, v.spec] as const),
      ),
    );
    this.uniqAnchorAxes = uniqBy(
      Array.from(this.anchorsMap.values(), ({ spec }) => ({
        axesSpec: spec.axesSpec,
        qualifications: [],
      })),
      (axis) => canonicalizeJson(getAxesId(axis.axesSpec)) + canonicalizeJson(axis.qualifications),
    );
    this.idToOriginalIdMap = new Map(
      options.columns.map((col) => [this.idDeriver.deriveS(col.spec), col.id] as const),
    );
  }

  dispose(): void {
    this.specFrameEntry.unref();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  getAnchors(): Map<string, PColumnIdAndSpec> {
    return this.anchorsMap;
  }

  getColumn(id: SUniversalPColumnId): undefined | ColumnSnapshot<SUniversalPColumnId> {
    const origId = this.idToOriginalIdMap.get(id);
    if (origId === undefined) return undefined;
    const col = this.columnsMap.get(origId);
    if (col === undefined) return undefined;
    return remapSnapshot(id, col);
  }

  findColumns(options?: AnchoredFindColumnsOptions): ColumnMatch[] {
    const mode = options?.mode ?? "enrichment";
    const constraints = matchingModeToConstraints(mode);
    const includeColumns = options?.include ? toMultiColumnSelectors(options.include) : undefined;
    const excludeColumns = options?.exclude ? toMultiColumnSelectors(options.exclude) : undefined;

    const response = this.specDriver.discoverColumns(this.specFrameEntry.key, {
      includeColumns,
      excludeColumns,
      constraints,
      maxHops: options?.maxHops ?? 4,
      axes: this.uniqAnchorAxes,
    });

    // Map every WASM discovery hit to a ColumnMatch.
    // The same physical column may appear multiple times when reachable through
    // different linker paths — each hit becomes a separate ColumnMatch so that
    // the caller can expand them into distinct table columns.
    const results: ColumnMatch[] = [];
    for (const hit of response.hits) {
      const origId = hit.hit.columnId as PObjectId;
      const col =
        this.columnsMap.get(origId) ??
        throwError(`Column with id ${origId} not found in collection`);
      const associatedId = this.idDeriver.deriveS(col.spec);

      results.push({
        path: hit.path.map((step) => {
          if (step.type !== "linker")
            throw new Error(`Unexpected discover-columns step type: ${step.type}`);
          return {
            linker: remapSnapshot(
              this.idDeriver.deriveS(step.linker.spec),
              this.columnsMap.get(step.linker.columnId) ??
                throwError(`Linker column with id ${step.linker.columnId} not found in collection`),
            ),
            qualifications: step.qualifications,
          };
        }),
        column: remapSnapshot(associatedId, col),
        variants: hit.mappingVariants,
        originalId: origId,
      });
    }

    return results;
  }
}

/**
 * Collect all columns from all providers, dedup by NativePObjectId.
 * First source wins.
 */
function collectColumns(providers: ColumnSnapshotProvider[]): ColumnSnapshot<PObjectId>[] {
  const seen = new Set<NativePObjectId>();
  const result: ColumnSnapshot<PObjectId>[] = [];

  for (const provider of providers) {
    const columns = provider.getAllColumns();
    for (const col of columns) {
      const nativeId = deriveNativeId(col.spec);
      if (seen.has(nativeId)) continue;
      seen.add(nativeId);
      result.push(col);
    }
  }

  return result;
}

// --- Shared snapshot helpers ---

/** Create a new snapshot with a different ID, preserving data accessors. */
function remapSnapshot<Id extends PObjectId>(
  id: Id,
  col: ColumnSnapshot<PObjectId>,
): ColumnSnapshot<Id> {
  return createColumnSnapshot(id, col.spec, col.data, col.dataStatus);
}

/** Normalize SDK ColumnSelectorInput to MultiColumnSelector[]. */
function toMultiColumnSelectors(input: ColumnSelector): MultiColumnSelector[] {
  return convertColumnSelectorToMultiColumnSelector(input);
}

// --- Anchor resolution ---

/**
 * Resolve each anchor value to a PColumnSpec.
 * - PColumnSpec: used directly
 * - PObjectId (string): looked up in the collected column map
 */
function resolveAnchorMap(
  anchors: Record<string, AnchorEntry>,
  columns: ColumnSnapshot<PObjectId>[],
  discoverColumns: (request: DiscoverColumnsRequest) => DiscoverColumnsResponse,
): Map<string, PColumnIdAndSpec> {
  const result = new Map<string, PColumnIdAndSpec>();
  const resovedIds = new Set<PObjectId>();
  const getDuplicateError = (key: string) =>
    `Anchor "${key}": selector matched a column that was already matched by another anchor; please refine the selector to match a different column`;

  for (const [key, anchor] of Object.entries(anchors)) {
    if (typeof anchor === "string") {
      const found =
        columns.find((col) => col.id === anchor) ??
        throwError(`Anchor "${key}": column with id "${anchor}" not found in sources`);
      if (resovedIds.has(found.id)) {
        throwError(getDuplicateError(key));
      }
      result.set(key, { columnId: found.id, spec: found.spec });
      resovedIds.add(found.id);
    } else if ("kind" in anchor) {
      if (!isPColumnSpec(anchor)) throwError(`Anchor "${key}": invalid PColumnSpec`);
      const nativeId = deriveNativeId(anchor);
      const found =
        columns.find((col) => deriveNativeId(col.spec) === nativeId) ??
        throwError(`Anchor "${key}": no column matching spec found in sources`);
      if (resovedIds.has(found.id)) {
        throwError(getDuplicateError(key));
      }
      result.set(key, { columnId: found.id, spec: anchor });
      resovedIds.add(found.id);
    } else {
      const matched = discoverColumns({
        includeColumns: toMultiColumnSelectors(anchor),
        excludeColumns: undefined,
        axes: [],
        maxHops: 0,
        constraints: matchingModeToConstraints("exact"),
      });
      if (matched.hits.length === 0) {
        throwError(`Anchor "${key}": no columns matched selector`);
      }
      if (matched.hits.length > 1) {
        throwError(
          `Anchor "${key}": selector is ambiguous and matched multiple columns; please refine the selector to match exactly one column`,
        );
      }
      if (resovedIds.has(matched.hits[0].hit.columnId as PObjectId)) {
        throwError(getDuplicateError(key));
      }

      result.set(key, matched.hits[0].hit);
      resovedIds.add(matched.hits[0].hit.columnId);
    }
  }

  if (resovedIds.size === 0) {
    throwError("At least one anchor must be resolved to a valid column");
  }

  return result;
}

// --- MatchingMode → DiscoverColumnsConstraints ---

function matchingModeToConstraints(mode: MatchingMode): DiscoverColumnsConstraints {
  switch (mode) {
    case "enrichment":
      return {
        allowFloatingSourceAxes: true,
        allowFloatingHitAxes: false,
        allowSourceQualifications: true,
        allowHitQualifications: true,
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
