import {
  BlockPackDescriptionManifest,
  CreateBlockPackDescriptionSchema
} from '@milaboratories/pl-model-middle-layer';
import { BlockComponentsConsolidate, BlockComponentsDescription } from './block_components';
import { BlockPackMetaConsolidate, BlockPackMetaDescription } from './block_meta';
import { z } from 'zod';

export function ResolvedBlockPackDescriptionFromPackageJson(root: string) {
  return CreateBlockPackDescriptionSchema(
    BlockComponentsDescription(root),
    BlockPackMetaDescription(root)
  );
}
export type BlockPackDescriptionAbsolute = z.infer<
  ReturnType<typeof ResolvedBlockPackDescriptionFromPackageJson>
>;

export function BlockPackDescriptionConsolidateToFolder(
  dstFolder: string,
  fileAccumulator?: string[]
) {
  return CreateBlockPackDescriptionSchema(
    BlockComponentsConsolidate(dstFolder, fileAccumulator),
    BlockPackMetaConsolidate(dstFolder, fileAccumulator)
  ).pipe(BlockPackDescriptionManifest);
}
