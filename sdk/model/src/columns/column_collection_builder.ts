import type {
  AxisQualification,
  DiscoverColumnsConstraints,
  DiscoverColumnsRequest,
  DiscoverColumnsResponse,
  MultiColumnSelector,
  NativePObjectId,
  PColumnSpec,
  PObjectId,
} from "@milaboratories/pl-model-common";
import { deriveNativeId, isPColumnSpec } from "@milaboratories/pl-model-common";
import type { ColumnSelector, RelaxedColumnSelector } from "./column_selector";
import { convertColumnSelectorToMultiColumnSelector } from "./column_selector";
import { TreeNodeAccessor } from "../render/accessor";
import type { ColumnSnapshot } from "./column_snapshot";
import type { ColumnSnapshotProvider, ColumnSource } from "./column_snapshot_provider";
import { ArrayColumnProvider, toColumnSnapshotProvider } from "./column_snapshot_provider";

import type { PFrameSpecDriver, PoolEntry, SpecFrameHandle } from "@milaboratories/pl-model-common";
import { throwError } from "@milaboratories/helpers";
import { getService } from "../services";

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
  getAnchors(): Map<string, ColumnSnapshot<PObjectId>>;

  /** Axis-aware column discovery. */
  findColumns(options?: AnchoredFindColumnsOptions): ColumnMatch[];

  /** Variant discovery with detailed mapping info for each hit. */
  findColumnVariants(options?: AnchoredFindColumnsOptions): ColumnVariant[];
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
  readonly column: ColumnSnapshot<PObjectId>;
  /** Match variants — different ways (paths/qualifications) to reach this column. */
  readonly variants: MatchVariant[];
}

export interface ColumnVariant<Id extends PObjectId = PObjectId> {
  /** Column snapshot with anchored SUniversalPColumnId. */
  readonly column: ColumnSnapshot<Id>;
  /** Full qualifications needed for integration. */
  readonly qualifications: MatchQualifications;
  /** Distinctive (minimal) qualifications needed for integration. */
  readonly distinctiveQualifications: MatchQualifications;
  /** Linker steps traversed to reach this hit; empty for direct matches. */
  readonly path: {
    linker: ColumnSnapshot<PObjectId>;
    qualifications: AxisQualification[];
  }[];
}

/** A single mapping variant describing how a hit column can be integrated. */
export interface MatchVariant {
  /** Full qualifications needed for integration. */
  readonly qualifications: MatchQualifications;
  /** Distinctive (minimal) qualifications needed for integration. */
  readonly distinctiveQualifications: MatchQualifications;
  /** Linker steps traversed to reach this hit; empty for direct matches. */
  readonly path: {
    linker: ColumnSnapshot<PObjectId>;
    qualifications: AxisQualification[];
  }[];
}

/** Qualifications needed for both already-integrated anchor columns and the hit column. */
export interface MatchQualifications {
  /** Qualifications for already-integrated anchor columns */
  readonly forQueries: Record<PObjectId, AxisQualification[]>;
  /** Qualifications for the hit column. */
  readonly forHit: AxisQualification[];
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

  constructor(private readonly specDriver: PFrameSpecDriver = getService("pframeSpec")) {}

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
      .filter((col): col is ColumnSnapshot<PObjectId> => col !== undefined);

    return results;
  }
}

// --- AnchoredColumnCollectionImpl ---

interface AnchoredColumnCollectionImplOptions extends ColumnCollectionImplOptions {
  readonly anchors: Record<string, AnchorEntry>;
}

class AnchoredColumnCollectionImpl implements AnchoredColumnCollection, Disposable {
  private readonly anchorsMap: Map<string, ColumnSnapshot<PObjectId>>;
  private readonly columnsMap: Map<PObjectId, ColumnSnapshot<PObjectId>>;
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
  }

  dispose(): void {
    this.specFrameEntry.unref();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  getAnchors(): Map<string, ColumnSnapshot<PObjectId>> {
    return this.anchorsMap;
  }

  findColumns(options?: AnchoredFindColumnsOptions): ColumnMatch[] {
    const mode = options?.mode ?? "enrichment";
    const constraints = matchingModeToConstraints(mode);
    const includeColumns = options?.include ? toMultiColumnSelectors(options.include) : undefined;
    const excludeColumns = options?.exclude ? toMultiColumnSelectors(options.exclude) : undefined;
    const anchors = Array.from(this.anchorsMap.values());
    const response = this.specDriver.discoverColumns(this.specFrameEntry.key, {
      includeColumns,
      excludeColumns,
      constraints,
      maxHops: options?.maxHops ?? 4,
      axes: anchors.map((anchor) => ({
        axesSpec: anchor.spec.axesSpec,
        qualifications: [],
      })),
    });

    const byColumn = response.hits.reduce<Map<PObjectId, ColumnMatch>>((acc, hit) => {
      const origId = hit.hit.columnId as PObjectId;
      const col =
        this.columnsMap.get(origId) ??
        throwError(`Column with id ${origId} not found in collection`);

      const path = hit.path.map((step) => {
        if (step.type !== "linker") {
          throw new Error(`Unexpected discover-columns step type: ${step.type}`);
        }

        return {
          linker:
            this.columnsMap.get(step.linker.columnId) ??
            throwError(`Linker column with id ${step.linker.columnId} not found in collection`),
          qualifications: step.qualifications,
        };
      });
      const variants: MatchVariant[] = hit.mappingVariants.map((v) => ({
        path,
        qualifications: remapFromIdxToId(v.qualifications, anchors),
        distinctiveQualifications: remapFromIdxToId(v.distinctiveQualifications, anchors),
      }));
      const existing = acc.get(origId);
      return acc.set(
        origId,
        existing === undefined
          ? { column: col, variants }
          : { ...existing, variants: [...existing.variants, ...variants] },
      );
    }, new Map());

    return Array.from(byColumn.values());
  }

  findColumnVariants(options?: AnchoredFindColumnsOptions): ColumnVariant[] {
    const matches = this.findColumns(options);
    return matches.flatMap((match) =>
      match.variants.map((variant) => ({
        column: match.column,
        path: variant.path,
        qualifications: variant.qualifications,
        distinctiveQualifications: variant.distinctiveQualifications,
      })),
    );
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

/** Normalize ColumnSelector (relaxed, single or array) to MultiColumnSelector[]. */
function toMultiColumnSelectors(input: ColumnSelector): MultiColumnSelector[] {
  return convertColumnSelectorToMultiColumnSelector(input);
}

// --- Anchor resolution ---

/**
 * Resolve each anchor entry to a ColumnSnapshot from the collected columns.
 * - PObjectId (string): looked up by id in the collected columns
 * - PColumnSpec: matched by deriveNativeId against collected columns
 * - RelaxedColumnSelector: resolved via discoverColumns in "exact" mode;
 *   must match exactly one column
 * Throws on unresolved, ambiguous, or duplicated matches. Requires at least one
 * anchor to resolve.
 */
function resolveAnchorMap(
  anchors: Record<string, AnchorEntry>,
  columns: ColumnSnapshot<PObjectId>[],
  discoverColumns: (request: DiscoverColumnsRequest) => DiscoverColumnsResponse,
): Map<string, ColumnSnapshot<PObjectId>> {
  const result = new Map<string, ColumnSnapshot<PObjectId>>();
  const resovedIds = new Set<PObjectId>();
  const getDuplicateError = (key: string) =>
    `Anchor "${key}": selector matched a column that was already matched by another anchor; please refine the selector to match a different column`;

  for (const [name, anchor] of Object.entries(anchors)) {
    if (typeof anchor === "string") {
      const found =
        columns.find((col) => col.id === anchor) ??
        throwError(`Anchor "${name}": column with id "${anchor}" not found in sources`);
      if (resovedIds.has(found.id)) {
        throwError(getDuplicateError(name));
      }
      result.set(name, found);
      resovedIds.add(found.id);
    } else if ("kind" in anchor) {
      if (!isPColumnSpec(anchor)) throwError(`Anchor "${name}": invalid PColumnSpec`);
      const nativeId = deriveNativeId(anchor);
      const found =
        columns.find((col) => deriveNativeId(col.spec) === nativeId) ??
        throwError(`Anchor "${name}": no column matching spec found in sources`);
      if (resovedIds.has(found.id)) {
        throwError(getDuplicateError(name));
      }
      result.set(name, found);
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
        throwError(`Anchor "${name}": no columns matched selector`);
      }
      if (matched.hits.length > 1) {
        throwError(
          `Anchor "${name}": selector is ambiguous and matched multiple columns; please refine the selector to match exactly one column`,
        );
      }
      if (resovedIds.has(matched.hits[0].hit.columnId as PObjectId)) {
        throwError(getDuplicateError(name));
      }

      const id = matched.hits[0].hit.columnId as PObjectId;
      const snap =
        columns.find((col) => col.id === id) ??
        throwError(`Anchor "${name}": matched column with id "${id}" not found in sources`);
      result.set(name, snap);
      resovedIds.add(snap.id);
    }
  }

  if (resovedIds.size === 0) {
    throwError("At least one anchor must be resolved to a valid column");
  }

  return result;
}

function remapFromIdxToId(
  qualifications: {
    forQueries: AxisQualification[][];
    forHit: AxisQualification[];
  },
  anchors: ColumnSnapshot<PObjectId>[],
): MatchQualifications {
  const forQueries = qualifications.forQueries.reduce<Record<PObjectId, AxisQualification[]>>(
    (acc, qs, i) => (anchors[i] ? ((acc[anchors[i].id] = qs), acc) : acc),
    {},
  );
  return { forQueries, forHit: qualifications.forHit };
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
