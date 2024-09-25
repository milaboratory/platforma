import {
  BlockPackDescriptionManifest,
  BlockPackId,
  BlockPackIdNoVersion,
  BlockPackManifest
} from '@milaboratories/pl-model-middle-layer';
import { z } from 'zod';

const MainPrefix = 'v2/';

export const ManifestFileName = 'manifest.json';

export function packageContentPrefix(bp: BlockPackId): string {
  return `${MainPrefix}${bp.organization}/${bp.name}/${bp.version}`;
}

export const ManifestSuffix = '/' + ManifestFileName;

// export function payloadFilePath(bp: BlockPackId, file: string): string {
//   return `${MainPrefix}${bp.organization}/${bp.name}/${bp.version}/${file}`;
// }

export const PackageOverview = z.object({
  schema: z.literal('v2'),
  versions: z.array(BlockPackDescriptionManifest)
});
export type PackageOverview = z.infer<typeof PackageOverview>;

export function packageOverviewPath(bp: BlockPackIdNoVersion): string {
  return `${MainPrefix}${bp.organization}/${bp.name}/overview.json`;
}

export const GlobalOverviewPath = `${MainPrefix}overview.json`;

export const GlobalOverviewEntry = z.object({
  id: BlockPackIdNoVersion,
  allVersions: z.array(z.string()),
  latestVersion: z.string(),
  latestDescription: BlockPackDescriptionManifest
});
export type GlobalOverviewEntry = z.infer<typeof GlobalOverviewEntry>;

export const GlobalOverview = z.object({
  schema: z.literal('v2'),
  packages: z.array(GlobalOverviewEntry)
});
export type GlobalOverview = z.infer<typeof GlobalOverview>;
