import {
  BlockPackDescriptionManifest,
  BlockPackId,
  BlockPackIdNoVersion
} from '@milaboratories/pl-model-middle-layer';
import { z } from 'zod';

const MainPrefix = 'v2/';

export function packageContentPrefix(bp: BlockPackId): string {
  return `${MainPrefix}${bp.organization}/${bp.name}/${bp.version}`;
}

// export function payloadFilePath(bp: BlockPackId, file: string): string {
//   return `${MainPrefix}${bp.organization}/${bp.name}/${bp.version}/${file}`;
// }

export function packageOverviewPath(bp: BlockPackIdNoVersion): string {
  return `${MainPrefix}${bp.organization}/${bp.name}/overview.json`;
}

export const GlobalOverviewPath = `${MainPrefix}overview.json`;

export const ManifestFile = 'manifest.json';

export const GlobalOverviewEntry = z.object({
  id: BlockPackIdNoVersion,
  allVersions: z.array(z.string()),
  latestVersion: z.string(),
  latestDescription: BlockPackDescriptionManifest
});
export type GlobalOverviewEntry = z.infer<typeof GlobalOverviewEntry>;

export const GlobalOverview = z.array(GlobalOverviewEntry);
export type GlobalOverview = z.infer<typeof GlobalOverview>;
