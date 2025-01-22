import type { ComputableCtx } from '@milaboratories/computable';
import type { InferSnapshot, PlTreeEntry, PlTreeEntryAccessor, PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import { isPlTreeEntry, isPlTreeEntryAccessor, makeResourceSnapshot, rsSchema } from '@milaboratories/pl-tree';

/** We need only resource type for this driver. */
export const DownloadableBlobSnapshot = rsSchema({});
export type DownloadableBlobSnapshot = InferSnapshot<typeof DownloadableBlobSnapshot>;

export function makeDownloadableBlobSnapshot(
  entryOrAccessor: PlTreeEntry | PlTreeNodeAccessor | PlTreeEntryAccessor,
  ctx: ComputableCtx,
): DownloadableBlobSnapshot {
  const node = isPlTreeEntry(entryOrAccessor)
    ? ctx.accessor(entryOrAccessor).node()
    : isPlTreeEntryAccessor(entryOrAccessor)
      ? entryOrAccessor.node()
      : entryOrAccessor;

  return makeResourceSnapshot(node, DownloadableBlobSnapshot);
}
