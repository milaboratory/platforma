import { z } from 'zod';
import { BlockComponentsConsolidate, BlockComponentsDescription } from './block_components';
import {
  BlockComponentsManifest,
  BlockPackMetaManifest,
  CreateBlockPackDescriptionSchema
} from '@milaboratory/pl-middle-layer-model';
import { BlockPackMetaConsolidate, BlockPackMetaDescription } from './meta';

export * from './block_components';
export * from './content_conversion';

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
    //BlockPackMetaToExplicit
    BlockPackMetaConsolidate(dstFolder, fileAccumulator)
  ).pipe(BlockPackDescriptionManifest);
}

export const BlockPackDescriptionManifest = CreateBlockPackDescriptionSchema(
  BlockComponentsManifest,
  BlockPackMetaManifest
);
export type BlockPackDescriptionManifest = z.infer<typeof BlockPackDescriptionManifest>;

export const BlockPackManifest = BlockPackDescriptionManifest.extend({
  schema: z.literal('v1'),
  files: z.array(z.string())
});
export type BlockPackManifest = z.infer<typeof BlockPackManifest>;

export const BlockPackManifestFile = 'manifest.json';
