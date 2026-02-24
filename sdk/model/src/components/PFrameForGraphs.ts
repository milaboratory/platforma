import type {
  PColumn,
  PColumnSpec,
  PFrameHandle,
} from "@milaboratories/pl-model-common";
import {
  Annotation,
  readAnnotationJson,
} from "@milaboratories/pl-model-common";
import type { PColumnDataUniversal, RenderCtxBase } from "../render";
import { getAllRelatedColumns, getRelatedColumns } from "../pframe_utils/columns";
export type { AxesVault } from "../pframe_utils/axes";
export { enrichCompatible, getAvailableWithLinkersAxes } from "../pframe_utils/axes";

export function isHiddenFromGraphColumn(column: PColumnSpec): boolean {
  return !!readAnnotationJson(column, Annotation.HideDataFromGraphs);
}

export function isHiddenFromUIColumn(column: PColumnSpec): boolean {
  return !!readAnnotationJson(column, Annotation.HideDataFromUi);
}

/**
 The aim of createPFrameForGraphs: to create pframe with block’s columns and all compatible columns from result pool
 (including linker columns and all label columns).
 Block’s columns are added to pframe as is.
 Other columns are added basing on set of axes of block’s columns, considering available with linker columns.
 Compatible columns must have at least one axis from block’s axes set. This axis of the compatible column from
 result pool must satisfy matchAxisId (it can have less domain keys than in block’s axis, but without conflicting values
 among existing ones).
 In requests to pframe (calculateTableData) columns must have strictly the same axes. For compatibility in case
 of partially matched axis we add to pframe a copy of this column with modified axis (with filled missed domains)
 and modified label (with added domain values in case if more than one copy with different domains exist).
 */
export function createPFrameForGraphs<A, U>(
  ctx: RenderCtxBase<A, U>,
  blockColumns?: PColumn<PColumnDataUniversal>[],
): PFrameHandle | undefined {
  const suitableSpec = (spec: PColumnSpec) =>
    !isHiddenFromUIColumn(spec) && !isHiddenFromGraphColumn(spec);
  // if current block doesn't produce own columns then use all columns from result pool
  if (!blockColumns) {
    return ctx.createPFrame(getAllRelatedColumns(ctx, suitableSpec));
  }

  return ctx.createPFrame(
    getRelatedColumns(ctx, { columns: blockColumns, predicate: suitableSpec }),
  );
}
