import type {
  PColumnSpec,
  PlRef,
  PObjectId,
  RelaxedColumnSelector,
} from "@milaboratories/pl-model-common";
import { PColumnName } from "@milaboratories/pl-model-common";
import type { RenderCtxBase } from "../../../render";
import type { ColumnRecipe, ColumnsSource } from "../../../columns";
import { ColumnsCollection, collectLinkerIds, isLeafColumn } from "../../../columns";
import type { ColumnsSelectorConfig } from "./createPlDataTableV3";

export type DiscoverTableColumnOptions = {
  sources?: ColumnsSource[];
  anchors: Record<string, PlRef | PObjectId | PColumnSpec | RelaxedColumnSelector>;
  selector: ColumnsSelectorConfig;
};

/** Split of discovered columns into anchor-matching (primary) and the rest. */
export type DiscoveredTableColumns = {
  readonly primary: ColumnRecipe[];
  readonly secondary: ColumnRecipe[];
};

/**
 * Discover columns from sources/anchors and split them into primary
 * (direct anchor hits — zero-hop, query is a bare column) and secondary
 * (reached via a linker chain, query carries a join).
 */
export function discoverTableColumns(
  ctx: RenderCtxBase,
  options: DiscoverTableColumnOptions,
): undefined | DiscoveredTableColumns {
  const discoveredColumns = ColumnsCollection(options.sources, { ctx: ctx.ctx })
    .discover({ ...options.selector, anchors: options.anchors })
    .getColumns();

  const primary: ColumnRecipe[] = [];
  const secondary: ColumnRecipe[] = [];
  for (const col of discoveredColumns) {
    if (isLeafColumn(col)) primary.push(col);
    else secondary.push(col);
  }
  return { primary, secondary };
}

/**
 * Discover label columns matching the axes of the given value columns from
 * ctx providers. Returns a list of label {@link ColumnRecipe}s.
 *
 * Primary columns are used as anchors for axis-aware label discovery.
 * `maxHops` is taken from the longest linker chain present in `columns`.
 */
export function discoverLabelColumns<A, U>(
  ctx: RenderCtxBase<A, U>,
  primary: ColumnRecipe[],
  columns: ColumnRecipe[],
): ColumnRecipe[] {
  if (columns.length === 0) return [];

  const axes = columns.flatMap((col) => col.getSpec().axesSpec);
  return (
    ColumnsCollection(undefined, { ctx: ctx.ctx })
      // .addSource({ columns, isFinal: true })
      .discover({
        include: axes.map((a) => ({
          name: { type: "exact", value: PColumnName.Label },
          axes: [{ name: { type: "exact", value: a.name } }],
        })),
        anchors: Object.fromEntries(primary.map((col, i) => [`anchor_${i}`, col.getSpec()])),
        maxHops: columns.reduce((acc, c) => Math.max(acc, collectLinkerIds(c).length), 0),
      })
      .getColumns()
  );
}
