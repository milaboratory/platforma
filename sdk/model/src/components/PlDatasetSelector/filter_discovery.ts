import { Annotation, extractPObjectId } from "@milaboratories/pl-model-common";
import type {
  ColumnsCollectionDriverModel,
  Option,
  PColumnSpec,
  PlRef,
  PObjectId,
  PObjectSpec,
} from "@milaboratories/pl-model-common";
import canonicalize from "canonicalize";
import type { ColumnRecipe, ColumnsSource } from "../../columns";
import { ColumnsCollection, collectLinkerColumns } from "../../columns";
import {
  deriveDistinctLabels,
  type DeriveLabelsOptions,
  type Entry,
} from "../../labels/derive_distinct_labels";

export interface FindFilterColumnsOptions {
  sources: ReadonlyArray<ColumnsSource>;
  anchorSpec: PColumnSpec;
  /** Override the resolved `columnsCollection` service (primarily for tests). */
  driver?: ColumnsCollectionDriverModel;
}

/**
 * Matches columns annotated `pl7.app/isSubset: "true"` whose axes ⊆ anchor axes.
 *
 * The axes-subset constraint is enforced by `mode: "enrichment"`, which sets
 * `allowFloatingHitAxes: false` — every axis of the matched column must be
 * present in the anchor's axes. See `matchingModeToConstraints()` in
 * `discover_columns.ts`.
 */
export function findFilterColumns(options: FindFilterColumnsOptions): ColumnRecipe[] {
  return ColumnsCollection([...options.sources], { driver: options.driver })
    .discover({
      anchors: { main: options.anchorSpec },
      mode: "enrichment",
      include: { annotations: { [Annotation.IsSubset]: "true" } },
    })
    .getColumns();
}

export type FilterMatchOptions = {
  /** Maps result-pool column id back to its source PlRef (see {@link buildRefMap}). */
  refsByObjectId: ReadonlyMap<PObjectId, PlRef>;
  /** Spec of the dataset the filters are subsets of. */
  datasetSpec: PObjectSpec;
  /**
   * Forwarded to `deriveDistinctLabels`. Any `formatters.native` caller
   * sets is silently overridden — the function relies on a no-op native
   * formatter to keep the algorithm from short-circuiting on filters'
   * inherited `pl7.app/label`.
   */
  labelOptions?: DeriveLabelsOptions;
};

/**
 * Derive labeled options from filter column variants, for use in DatasetOption.filters.
 *
 * Entries whose column id has no PlRef in `refsByObjectId` are silently
 * skipped — they cannot be exposed as user-selectable options.
 */
export function filterMatchesToOptions(
  variants: ColumnRecipe[],
  options: FilterMatchOptions,
): Option[] {
  if (variants.length === 0) return [];

  const { refsByObjectId, datasetSpec, labelOptions } = options;

  // One Option per variant — `deriveDistinctLabels` disambiguates labels by
  // path. All variants of the same column share a terminal PObjectId, so the
  // ref lookup happens once per variant.
  const entries: (Entry & { ref: PlRef })[] = variants.flatMap((variant) => {
    const ref = refsByObjectId.get(extractPObjectId(variant.id));
    if (ref === undefined) return [];
    return [
      {
        ref,
        spec: variant.getSpec(),
        linkerPath: collectLinkerColumns(variant).map((linker) => ({ spec: linker.getSpec() })),
      },
    ];
  });

  // Appending the dataset forces a discriminating trace step into every
  // filter label (yielding e.g. "Bulk / Top 10"); the dataset's own label
  // is dropped because we only zip `entries`. Native label is force-
  // suppressed (the override sits after caller's spread) — filters
  // inherit the dataset's `pl7.app/label` and would otherwise satisfy
  // uniqueness before any trace step is consulted.
  const labels = deriveDistinctLabels([...entries, { spec: datasetSpec }], {
    ...labelOptions,
    formatters: { ...labelOptions?.formatters, native: () => undefined },
  });

  return entries.map(({ ref }, i) => ({ ref, label: labels[i] }));
}

/** Build the `refsByObjectId` map from `ctx.resultPool.getSpecs().entries`. */
export function buildRefMap(entries: readonly { readonly ref: PlRef }[]): Map<PObjectId, PlRef> {
  return new Map(entries.map((e) => [canonicalize(e.ref)! as PObjectId, e.ref]));
}
