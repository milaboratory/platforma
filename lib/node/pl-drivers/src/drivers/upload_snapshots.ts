import { ComputableCtx } from '@milaboratories/computable';
import {
  InferSnapshot,
  isPlTreeEntry,
  isPlTreeEntryAccessor,
  makeResourceSnapshot,
  PlTreeEntry,
  PlTreeEntryAccessor,
  PlTreeNodeAccessor,
  rsSchema
} from '@milaboratories/pl-tree';
import { ImportFileHandleUploadData } from './types';

/** Options from BlobUpload resource that have to be passed to getProgress. */

/** ResourceSnapshot that can be passed to GetProgressID */
export const UploadResourceSnapshot = rsSchema({
  data: ImportFileHandleUploadData,
  fields: {
    blob: false
  }
});

export const IndexResourceSnapshot = rsSchema({
  fields: {
    incarnation: false
  }
});

export type UploadResourceSnapshot = InferSnapshot<typeof UploadResourceSnapshot>;
export type IndexResourceSnapshot = InferSnapshot<typeof IndexResourceSnapshot>;

export type ImportResourceSnapshot = UploadResourceSnapshot | IndexResourceSnapshot;

export function makeBlobImportSnapshot(
  entryOrAccessor: PlTreeEntry | PlTreeNodeAccessor | PlTreeEntryAccessor,
  ctx: ComputableCtx
): ImportResourceSnapshot {
  const node = isPlTreeEntry(entryOrAccessor)
    ? ctx.accessor(entryOrAccessor).node()
    : isPlTreeEntryAccessor(entryOrAccessor)
      ? entryOrAccessor.node()
      : entryOrAccessor;
  if (node.resourceType.name.startsWith('BlobUpload'))
    return makeResourceSnapshot(node, UploadResourceSnapshot);
  else return makeResourceSnapshot(node, IndexResourceSnapshot);
}
