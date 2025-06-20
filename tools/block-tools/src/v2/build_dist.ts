import {
  BlockPackDescriptionManifest,
  BlockPackManifest,
  BlockPackManifestFile,
  ManifestFileInfo
} from '@milaboratories/pl-model-middle-layer';
import { BlockPackDescriptionAbsolute, BlockPackDescriptionConsolidateToFolder } from './model';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { calculateSha256 } from '../util';

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
      const bytes = await fsp.readFile(path.resolve(dst, f));
      const sha256 = await calculateSha256(bytes);
      return { name: f, size: bytes.length, sha256 };
    })
  );

  // reading model.json and extracting feature flags
  const modelJson = await fsp.readFile(path.join(dst, descriptionRelative.components.model.path), 'utf-8');
  const modelJsonParsed = JSON.parse(modelJson);
  const featureFlags = modelJsonParsed.featureFlags;

  const manifest: BlockPackManifest = BlockPackManifest.parse({
    schema: 'v2',
    description: descriptionRelative,
    files: filesForManifest,
    codeFeatureFlags: featureFlags,
    timestamp: Date.now()
  } satisfies BlockPackManifest);
  await fsp.writeFile(path.resolve(dst, BlockPackManifestFile), JSON.stringify(manifest));
  return manifest;
}
