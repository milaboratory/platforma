import type { MultiColumnSelector, Option, PObjectSpec } from "@milaboratories/pl-model-common";
import {
  columnProducer,
  createPlRef,
  multiColumnSelectorsToPredicate,
} from "@milaboratories/pl-model-common";
import type { ColumnRecipe } from "../../columns";
import { ColumnsCollection } from "../../columns";
import {
  deriveDistinctLabels,
  type DeriveLabelsOptions,
} from "../../labels/derive_distinct_labels";
import type { RenderCtxBase } from "../../render";
import type { DatasetOption } from "./dataset_selection";
import { filterMatchesToOptions, findFilterColumns } from "./filter_discovery";
import { findEnrichmentColumns, labelEnrichments } from "./enrichment_discovery";

export type BuildDatasetOptions = {
  /**
   * Which result pool columns qualify as datasets. Defaults to all. A selector
   * is matched by the host; a predicate reads the spec of every result pool
   * column, so prefer a selector when it can say the same.
   */
  primary?: SpecPredicateOption;
  /**
   * Restricts which result pool columns are considered as filters. Intersected
   * with the built-in `pl7.app/isSubset: "true"` constraint. Defaults to
   * accept-all.
   */
  filter?: SpecPredicateOption;
  /**
   * Formatting options forwarded to label derivation for both filter and
   * enrichment rows. `formatters.native` on the filter path is overridden
   * — see `FilterMatchOptions.labelOptions`.
   */
  labelOptions?: DeriveLabelsOptions;
  /**
   * Enables enrichment discovery and filters hits attached to
   * `DatasetOption.enrichments`. Use `() => true` to accept all; omit to disable.
   */
  withEnrichments?: SpecPredicateOption;
  /** Maximum linker hops considered. Only used when `withEnrichments` is set. */
  enrichmentMaxHops?: number;
  /**
   * Whether the dataset refs in the returned options carry `requireEnrichments: true`.
   * A block that stores such a ref depends on every block that enriches the dataset.
   * Set `false` for a block that only needs the dataset and its filters. Defaults to `true`.
   */
  requireEnrichments?: boolean;
};

/**
 * Usage:
 * ```ts
 * .output("datasetOptions", (ctx) => buildDatasetOptions(ctx))
 * ```
 */
export function buildDatasetOptions(
  ctx: RenderCtxBase,
  opts?: BuildDatasetOptions,
): DatasetOption[] | undefined {
  const pool = ColumnsCollection(["result_pool"], { ctx: ctx.ctx });

  // A dataset is stored as a reference to a block output, so only a column
  // that is one can be offered.
  const datasets = findDatasets(pool, opts?.primary).flatMap((column) => {
    const producer = columnProducer(column.id);
    return producer === undefined ? [] : [{ column, producer }];
  });
  if (datasets.length === 0) return [];

  const labels = deriveDistinctLabels(datasets.map(({ column }) => column.getSpec()));
  const requireEnrichments = opts?.requireEnrichments ?? true;
  const filterPredicate = toPredicate(opts?.filter);

  const withEnrichments = opts?.withEnrichments;
  const enrichmentSearch =
    withEnrichments === undefined
      ? undefined
      : {
          // Enrichments are also looked for among this block's own columns.
          // Built once: every dataset searches the same set.
          sources: [ColumnsCollection(["current_block", pool], { ctx: ctx.ctx })],
          maxHops: opts?.enrichmentMaxHops,
          ...(typeof withEnrichments === "function"
            ? { predicate: withEnrichments }
            : { include: withEnrichments }),
        };

  return datasets.map(({ column, producer }, i): DatasetOption => {
    const datasetSpec = column.getSpec();
    const primary: Option = {
      ref: createPlRef(producer.blockId, producer.name, requireEnrichments),
      label: labels[i],
    };

    const filters = filterMatchesToOptions(
      findFilterColumns({ sources: [pool], anchorSpec: datasetSpec }).filter((match) =>
        filterPredicate(match.getSpec()),
      ),
      { datasetSpec, labelOptions: opts?.labelOptions },
    );

    const enrichments =
      enrichmentSearch === undefined
        ? []
        : labelEnrichments(
            findEnrichmentColumns({ ...enrichmentSearch, anchorSpec: datasetSpec }),
            opts?.labelOptions,
          );

    return {
      primary,
      ...(filters.length > 0 ? { filters } : {}),
      ...(enrichments.length > 0 ? { enrichments } : {}),
    };
  });
}

// Internals

type SpecPredicateOption =
  | MultiColumnSelector
  | MultiColumnSelector[]
  | ((spec: PObjectSpec) => boolean);

function toPredicate(opt: SpecPredicateOption | undefined): (spec: PObjectSpec) => boolean {
  if (opt === undefined) return () => true;
  return typeof opt === "function" ? opt : multiColumnSelectorsToPredicate(opt);
}

function findDatasets(
  pool: ColumnsCollection,
  primary: SpecPredicateOption | undefined,
): ColumnRecipe[] {
  if (primary === undefined) return pool.getColumns();
  if (typeof primary === "function") {
    return pool.getColumns().filter((column) => primary(column.getSpec()));
  }
  return pool.filter({ include: primary }).getColumns();
}
