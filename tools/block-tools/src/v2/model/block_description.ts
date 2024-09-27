import {
  addPrefixToRelative,
  BlockComponents,
  BlockPackDescriptionManifest,
  BlockPackMeta,
  ContentRelative,
  ContentRelativeBinary,
  ContentRelativeText,
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

export function BlockPackDescriptionManifestAddRelativePathPrefix(prefix: string) {
  const transformer = addPrefixToRelative(prefix);
  return BlockPackDescriptionManifest.pipe(
    CreateBlockPackDescriptionSchema(
      BlockComponents(
        ContentRelative.transform(transformer),
        ContentRelative.transform(transformer)
      ),
      BlockPackMeta(
        ContentRelativeText.transform(transformer),
        ContentRelativeBinary.transform(transformer)
      )
    )
  ).pipe(BlockPackDescriptionManifest);
}
