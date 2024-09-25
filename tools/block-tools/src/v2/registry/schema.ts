import type { BlockPackId, BlockPackIdNoVersion } from '@milaboratories/pl-model-middle-layer';

const MainPrefix = 'v2/';

export function packageContentPrefix(bp: BlockPackId): string {
  return `${MainPrefix}${bp.organization}/${bp.name}/${bp.version}`;
}

export function payloadFilePath(bp: BlockPackId, file: string): string {
  return `${MainPrefix}${bp.organization}/${bp.name}/${bp.version}/${file}`;
}

export function packageOverviewPath(bp: BlockPackIdNoVersion): string {
  return `${MainPrefix}${bp.organization}/${bp.name}/overview.json`;
}

export const GlobalOverviewPath = `${MainPrefix}overview.json`;

export const ManifestFile = 'manifest.json';

export interface GlobalOverviewEntry {
  organization: string;
  package: string;
  allVersions: string[];
  latestVersion: string;
  latestMeta: object;
}

export type GlobalOverview = GlobalOverviewEntry[];
