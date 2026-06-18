import type {
  PColumn,
  PColumnSpec,
  PColumnLazy,
  PFrameDef,
  PObjectId,
} from "@milaboratories/pl-model-common";
import {
  getNormalizedAxesList,
  getAxisId,
  canonicalizeJson,
  isLinkerColumn,
  matchAxisId,
  isLabelColumn,
} from "@milaboratories/pl-model-common";
import type { AxesVault } from "./axes";
import { enrichCompatible, getAvailableWithLinkersAxes } from "./axes";
import type { RenderCtxBase, PColumnDataUniversal } from "../render";
import { PColumnCollection } from "../render";
import { ColumnCollectionBuilder } from "../columns";
import { collectCtxColumnSnapshotProviders } from "../columns/ctx_column_sources";

export function getAllRelatedColumns<A, U>(
  ctx: RenderCtxBase<A, U>,
  predicate: (spec: PColumnSpec) => boolean,
): PFrameDef<PColumn<PColumnDataUniversal> | PColumnLazy<undefined | PColumnDataUniversal>> {
  // if current block doesn't produce own columns then use all columns from result pool
  const columns = new PColumnCollection();
  columns.addColumnProvider(ctx.resultPool);
  const allColumns =
    columns.getColumns(predicate, {
      dontWaitAllData: true,
      overrideLabelAnnotation: false,
    }) ?? [];

  const allAxes: AxesVault = new Map(
    allColumns
      .flatMap((column) => getNormalizedAxesList(column.spec.axesSpec))
      .map((axisSpec) => {
        const axisId = getAxisId(axisSpec);
        return [canonicalizeJson(axisId), axisSpec];
      }),
  );

  // additional columns are duplicates with extra fields in domains for compatibility if there are ones with partial match
  const extendedColumns = enrichCompatible(allAxes, allColumns);

  return extendedColumns;
}

export function getRelatedColumns<A, U>(
  ctx: RenderCtxBase<A, U>,
  {
    columns: rootColumns,
    predicate,
  }: {
    columns: PColumn<PColumnDataUniversal>[];
    predicate: (spec: PColumnSpec) => boolean;
  },
): PFrameDef<PColumn<PColumnDataUniversal> | PColumnLazy<undefined | PColumnDataUniversal>> {
  // if current block has its own columns then take from result pool only compatible with them
  const columns = new PColumnCollection();
  columns.addColumnProvider(ctx.resultPool);
  columns.addColumns(rootColumns);

  // all possible axes from block columns
  const blockAxes: AxesVault = new Map();
  // axes from block columns and compatible result pool columns
  const allAxes: AxesVault = new Map();
  for (const c of rootColumns) {
    for (const spec of getNormalizedAxesList(c.spec.axesSpec)) {
      const aid = getAxisId(spec);
      blockAxes.set(canonicalizeJson(aid), spec);
      allAxes.set(canonicalizeJson(aid), spec);
    }
  }

  // all linker columns always go to pFrame - even it's impossible to use some of them they all are hidden
  const linkerColumns =
    columns.getColumns((spec) => predicate(spec) && isLinkerColumn(spec), {
      dontWaitAllData: true,
    }) ?? [];
  const availableWithLinkersAxes = getAvailableWithLinkersAxes(linkerColumns, blockAxes);

  // all possible axes from connected linkers
  for (const item of availableWithLinkersAxes) {
    blockAxes.set(...item);
    allAxes.set(...item);
  }

  const blockAxesArr = Array.from(blockAxes.values());
  // all compatible with block columns but without label columns
  let compatibleWithoutLabels = (
    columns.getColumns(
      (spec) =>
        predicate(spec) &&
        spec.axesSpec.some((axisSpec) => {
          const axisId = getAxisId(axisSpec);
          return blockAxesArr.some((selectorAxisSpec) =>
            matchAxisId(getAxisId(selectorAxisSpec), axisId),
          );
        }),
      { dontWaitAllData: true, overrideLabelAnnotation: false },
    ) ?? []
  ).filter((column) => !isLabelColumn(column.spec));

  // extend axes set for label columns request
  for (const c of compatibleWithoutLabels) {
    for (const spec of getNormalizedAxesList(c.spec.axesSpec)) {
      const aid = getAxisId(spec);
      allAxes.set(canonicalizeJson(aid), spec);
    }
  }

  const allAxesArr = Array.from(allAxes.values());
  // extend allowed columns - add columns thad doesn't have axes from block, but have all axes in 'allAxes' list (that means all axes from linkers or from 'hanging' of other selected columns)
  compatibleWithoutLabels = (
    columns.getColumns(
      (spec) =>
        predicate(spec) &&
        spec.axesSpec.every((axisSpec) => {
          const axisId = getAxisId(axisSpec);
          return allAxesArr.some((selectorAxisSpec) =>
            matchAxisId(getAxisId(selectorAxisSpec), axisId),
          );
        }),
      { dontWaitAllData: true, overrideLabelAnnotation: false },
    ) ?? []
  ).filter((column) => !isLabelColumn(column.spec));

  // label columns must be compatible with full set of axes - block axes and axes from compatible columns from result pool
  const compatibleLabels = (
    columns.getColumns(
      (spec) =>
        predicate(spec) &&
        spec.axesSpec.some((axisSpec) => {
          const axisId = getAxisId(axisSpec);
          return allAxesArr.some((selectorAxisSpec) =>
            matchAxisId(getAxisId(selectorAxisSpec), axisId),
          );
        }),
      { dontWaitAllData: true, overrideLabelAnnotation: false },
    ) ?? []
  ).filter((column) => isLabelColumn(column.spec));

  const compatible = [...compatibleWithoutLabels, ...compatibleLabels];

  // Drop result-pool columns that share an axis with the block but cannot join it.
  const integrableIds = discoverIntegrableColumnIds(ctx, rootColumns);
  const rootIds = new Set(rootColumns.map((c) => c.id));
  const connected = compatible.filter(
    (c) => rootIds.has(c.id) || isLinkerColumn(c.spec) || (integrableIds?.has(c.id) ?? true),
  );

  // additional columns are duplicates with extra fields in domains for compatibility if there are ones with partial match
  const extendedColumns = enrichCompatible(blockAxes, connected);

  return extendedColumns;
}

/** Column ids that discovery confirms integrate with the block, or `undefined` when it can't decide. */
function discoverIntegrableColumnIds<A, U>(
  ctx: RenderCtxBase<A, U>,
  rootColumns: PColumn<PColumnDataUniversal>[],
): Set<PObjectId> | undefined {
  const anchorSpecs = Array.from(
    new Map(rootColumns.map((c) => [canonicalizeJson(c.spec), c.spec])).values(),
  );
  if (anchorSpecs.length === 0) return undefined;

  try {
    const collection = new ColumnCollectionBuilder()
      .addSources(collectCtxColumnSnapshotProviders(ctx))
      .build({
        allowPartialColumnList: true,
        anchors: Object.fromEntries(anchorSpecs.map((spec, i) => [`anchor_${i}`, spec])),
      });
    try {
      return new Set(collection.findColumns({ mode: "enrichment" }).map((m) => m.column.id));
    } finally {
      collection.dispose();
    }
  } catch {
    return undefined;
  }
}
