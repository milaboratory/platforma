import {
  BlockPackDescriptionManifest,
  BlockPackManifest,
  BlockPackManifestFile,
  ManifestFileInfo
} from '@milaboratories/pl-model-middle-layer';
import { BlockPackDescriptionAbsolute, BlockPackDescriptionConsolidateToFolder } from './model';
import fsp from 'node:fs/promises';
import path from 'node:path';

export async function buildBlockPackDist(
  description: BlockPackDescriptionAbsolute,
  dst: string
): Promise<BlockPackManifest> {
  await fsp.mkdir(dst, { recursive: true });
  const files: string[] = [];
  const descriptionRelative: BlockPackDescriptionManifest =
    await BlockPackDescriptionConsolidateToFolder(dst, files).parseAsync(description);
  const filesForManifest = await Promise.all(
    files.map(async (f): Promise<ManifestFileInfo> => {
      const bytes = await fsp.readFile(f);
      const sha256 = Buffer.from(await crypto.subtle.digest('sha256', bytes)).toString('hex');
      return { name: f, size: bytes.length, sha256 };
    })
  );
  const manifest: BlockPackManifest = BlockPackManifest.parse({
    schema: 'v2',
    description: descriptionRelative,
    files: filesForManifest
  } satisfies BlockPackManifest);
  await fsp.writeFile(path.resolve(dst, BlockPackManifestFile), JSON.stringify(manifest));
  return manifest;
}
