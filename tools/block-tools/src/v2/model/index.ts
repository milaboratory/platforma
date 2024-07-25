import { ZodTypeAny, z } from 'zod';
import {
  BlockComponentsConsolidate,
  BlockComponentsDescription,
  BlockComponentsDescriptionRaw,
  BlockComponentsManifest
} from './block_components';
import { BlockPackId } from './block_pack_id';
import {
  BlockPackMetaConsolidate,
  BlockPackMetaDescription,
  BlockPackMetaDescriptionRaw,
  BlockPackMetaManifest,
  BlockPackMetaToExplicit
} from './meta';

export const BlockPackDescriptionFromPackageJsonRaw = z.object({
  components: BlockComponentsDescriptionRaw,
  meta: BlockPackMetaDescriptionRaw
});

function CreateBlockPackDescriptionSchema<Components extends ZodTypeAny, Meta extends ZodTypeAny>(
  components: Components,
  meta: Meta
) {
  return z.object({
    id: BlockPackId,
    components,
    meta
  });
}

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
  files: z.array(z.string())
});
export type BlockPackManifest = z.infer<typeof BlockPackManifest>;

export const BlockPackManifestFile = 'block-manifest.json';
