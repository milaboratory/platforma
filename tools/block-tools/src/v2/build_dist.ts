import {
  BlockPackDescriptionAbsolute,
  BlockPackDescriptionConsolidateToFolder,
  BlockPackDescriptionManifest,
  BlockPackManifest,
  BlockPackManifestFile
} from './model';
import fsp from 'node:fs/promises';
import { BlockPackMetaConsolidate, BlockPackMetaDescription } from './model/meta';
import { patch } from 'semver';
import path from 'node:path';

export async function buildBlockPackDist(
  description: BlockPackDescriptionAbsolute,
  dst: string
): Promise<BlockPackManifest> {
  await fsp.mkdir(dst, { recursive: true });
  const files: string[] = [];
  const descriptionRelative = await BlockPackDescriptionConsolidateToFolder(dst, files).parseAsync(
    description
  );
  const manifest: BlockPackManifest = BlockPackManifest.parse({
    schema: 'v1',
    ...descriptionRelative,
    files
  });
  await fsp.writeFile(path.resolve(dst, BlockPackManifestFile), JSON.stringify(manifest));
  return manifest;
}
