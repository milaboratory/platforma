import type {
  NativePObjectId,
  PColumnSpec,
  PlRef,
  PObjectId,
  SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import { deriveNativeId } from "@milaboratories/pl-model-common";
import type { ColumnSelectorInput } from "./column_selector";
import { selectorsToPredicate } from "./column_selector";
import { TreeNodeAccessor } from "../render/accessor";
import type { ColumnSnapshot } from "./column_snapshot";
import {
  createColumnSnapshot,
  createComputingColumnData,
  createReadyColumnData,
} from "./column_snapshot";
import type { ColumnProvider, ColumnSource } from "./column_provider";
import { ArrayColumnProvider, toColumnProvider } from "./column_provider";

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
  findColumns(opts?: AnchoredFindColumnsOpts): ColumnMatch[];
}

/** Controls axis matching behavior for anchored discovery. */
export type MatchingMode = "enrichment" | "related" | "exact";

/** Options for anchored collection findColumns. */
export interface AnchoredFindColumnsOpts extends FindColumnsOptions {
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

export interface BuildOpts {
  allowPartialColumnList?: true;
}

export interface AnchoredBuildOpts extends BuildOpts {
  anchors: Record<string, PlRef | PObjectId | PColumnSpec>;
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
  private readonly providers: ColumnProvider[] = [];

  /**
   * @param markUnstable Callback to mark the render context unstable.
   *   Used when constructing ColumnData active objects for computing columns.
   *   If not provided, accessing data on computing columns will not mark unstable
   *   (suitable for spec-only use cases).
   */
  constructor(private readonly markUnstable?: () => void) {}

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
  build(opts: {
    allowPartialColumnList: true;
  }): ColumnCollection & { readonly columnListComplete: boolean };
  /** Anchored collection — axis-aware discovery, SUniversalPColumnId namespace. */
  build(
    opts: AnchoredBuildOpts & { allowPartialColumnList: true },
  ): AnchoredColumnCollection & { readonly columnListComplete: boolean };
  build(opts: AnchoredBuildOpts): undefined | AnchoredColumnCollection;
  build(
    opts?: BuildOpts | AnchoredBuildOpts,
  ):
    | undefined
    | ColumnCollection
    | AnchoredColumnCollection
    | (ColumnCollection & { readonly columnListComplete: boolean })
    | (AnchoredColumnCollection & { readonly columnListComplete: boolean }) {
    const allowPartial = opts?.allowPartialColumnList === true;
    const hasAnchors = opts !== undefined && "anchors" in opts;

    // Check column list completeness
    const allComplete = this.providers.every((p) => p.isColumnListComplete());
    if (!allComplete && !allowPartial) return undefined;

    // Collect all columns, dedup by native ID (first source wins)
    const columnMap = this.collectColumns();

    if (hasAnchors) {
      // @TODO Step 7: anchored collection with axis-aware discovery
      throw new Error("AnchoredColumnCollection not yet implemented (Step 7)");
    }

    return new ColumnCollectionImpl(
      columnMap,
      this.markUnstable,
      allowPartial ? allComplete : false,
    );
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

// --- ColumnCollectionImpl ---

class ColumnCollectionImpl implements ColumnCollection {
  constructor(
    private readonly columns: Map<PObjectId, ColumnSnapshot<PObjectId>>,
    private readonly markUnstable: () => void = () => {},
    public readonly columnListComplete: boolean = false,
  ) {}

  getColumn(id: PObjectId): undefined | ColumnSnapshot<PObjectId> {
    const col = this.columns.get(id);
    if (col === undefined) return undefined;
    return this.toSnapshot(col);
  }

  findColumns(opts?: FindColumnsOptions): ColumnSnapshot<PObjectId>[] {
    const columns = [...this.columns.values()];

    let filtered = columns;

    if (opts?.include) {
      const includePred = selectorsToPredicate(opts.include);
      filtered = filtered.filter((col) => includePred(col.spec));
    }

    if (opts?.exclude) {
      const excludePred = selectorsToPredicate(opts.exclude);
      filtered = filtered.filter((col) => !excludePred(col.spec));
    }

    return filtered.map((col) => this.toSnapshot(col));
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
