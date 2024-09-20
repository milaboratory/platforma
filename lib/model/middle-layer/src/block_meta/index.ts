import { ZodTypeAny, string, z } from 'zod';
import { BlockComponentsDescriptionRaw, BlockComponentsManifest } from './block_components';
import { BlockPackId } from './block_pack_id';
import { BlockPackMetaDescriptionRaw, BlockPackMetaManifest } from './meta';

export * from './block_components';
export * from './block_pack_id';
export * from './common';
export * from './content_types';
export * from './meta';
export * from './semver';

export const BlockPackDescriptionFromPackageJsonRaw = z.object({
  components: BlockComponentsDescriptionRaw,
  meta: BlockPackMetaDescriptionRaw
});

export function CreateBlockPackDescriptionSchema<
  Components extends ZodTypeAny,
  Meta extends ZodTypeAny
>(components: Components, meta: Meta) {
  return z.object({
    id: BlockPackId,
    components,
    meta
  });
}

export const BlockPackDescriptionManifest = CreateBlockPackDescriptionSchema(
  BlockComponentsManifest,
  BlockPackMetaManifest
);
export type BlockPackDescriptionManifest = z.infer<typeof BlockPackDescriptionManifest>;

export const BlockPackDescriptionRaw = CreateBlockPackDescriptionSchema(
  BlockComponentsDescriptionRaw,
  BlockPackMetaDescriptionRaw
);
export type BlockPackDescriptionRaw = z.infer<typeof BlockPackDescriptionRaw>;

export const ManifestFileInfo = z.object({
  name: z.string(),
  size: z.number().int(),
  sha256: z
    .string()
    .regex(/[0-9a-fA-F]/)
    .toUpperCase()
    .length(64) // 256 / 4 (bits per hex register)
});
export type ManifestFileInfo = z.infer<typeof ManifestFileInfo>;

export const BlockPackManifest = z.object({
  schema: z.literal('v1'),
  description: BlockPackDescriptionManifest,
  files: z.array(ManifestFileInfo)
});
export type BlockPackManifest = z.infer<typeof BlockPackManifest>;
