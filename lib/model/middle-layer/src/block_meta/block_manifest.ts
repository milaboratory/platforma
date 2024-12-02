import { z } from 'zod';
import { BlockComponents } from './block_components';
import { ContentRelative, ContentRelativeBinary, ContentRelativeText } from './content_types';
import { CreateBlockPackDescriptionSchema } from './block_description';
import { BlockPackMeta } from './block_meta';
import * as R from 'remeda';
import { BlockPackId } from './block_id';

export const BlockComponentsManifest = BlockComponents(ContentRelative, ContentRelative);
export type BlockComponentsManifest = z.infer<typeof BlockComponentsManifest>;

export const BlockPackMetaManifest = BlockPackMeta(ContentRelativeText, ContentRelativeBinary);
export type BlockPackMetaManifest = z.infer<typeof BlockPackMetaManifest>;

/** Block description to be used in block manifest */
export const BlockPackDescriptionManifest = CreateBlockPackDescriptionSchema(
  BlockComponentsManifest,
  BlockPackMetaManifest
);
export type BlockPackDescriptionManifest = z.infer<typeof BlockPackDescriptionManifest>;

export const Sha256Schema = z
  .string()
  .regex(/[0-9a-fA-F]/)
  .toUpperCase()
  .length(64); // 256 / 4 (bits per hex register);

export const ManifestFileInfo = z.object({
  name: z.string(),
  size: z.number().int(),
  sha256: Sha256Schema
});
export type ManifestFileInfo = z.infer<typeof ManifestFileInfo>;

export const BlockPackManifest = z.object({
  schema: z.literal('v2'),
  description: BlockPackDescriptionManifest,
  timestamp: z.number().optional(),
  files: z.array(ManifestFileInfo)
});
export type BlockPackManifest = z.infer<typeof BlockPackManifest>;

export const BlockPackManifestFile = 'manifest.json';

export function overrideManifestVersion<T extends { description: { id: BlockPackId } }>(
  manifest: T,
  newVersion: string
): T {
  return R.mergeDeep(manifest, { description: { id: { version: newVersion } } }) as T;
}
