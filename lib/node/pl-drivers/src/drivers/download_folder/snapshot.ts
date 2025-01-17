import { ComputableCtx } from '@milaboratories/computable';
import { InferSnapshot, isPlTreeEntry, isPlTreeEntryAccessor, makeResourceSnapshot, PlTreeEntry, PlTreeEntryAccessor, PlTreeNodeAccessor, rsSchema } from '@milaboratories/pl-tree';

/** We need only resource type for this driver. */
export const DownloadableBlobSnapshot = rsSchema({});
export type DownloadableBlobSnapshot = InferSnapshot<typeof DownloadableBlobSnapshot>;

export function makeDownloadableBlobSnapshot(
  entryOrAccessor: PlTreeEntry | PlTreeNodeAccessor | PlTreeEntryAccessor,
  ctx: ComputableCtx
): DownloadableBlobSnapshot {
  const node = isPlTreeEntry(entryOrAccessor)
    ? ctx.accessor(entryOrAccessor).node()
    : isPlTreeEntryAccessor(entryOrAccessor)
      ? entryOrAccessor.node()
      : entryOrAccessor;

  return makeResourceSnapshot(node, DownloadableBlobSnapshot);
}
