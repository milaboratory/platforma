export interface FullBlockPackageName {
  organization: string;
  package: string;
  version: string;
}

const MainPrefix = 'v1/';

export function packageContentPrefix(bp: FullBlockPackageName): string {
  return `${MainPrefix}${bp.organization}/${bp.package}/${bp.version}`;
}

export function payloadFilePath(bp: FullBlockPackageName, file: string): string {
  return `${MainPrefix}${bp.organization}/${bp.package}/${bp.version}/${file}`;
}

export type BlockPackageNameWithoutVersion = Pick<FullBlockPackageName, 'organization' | 'package'>;

export function packageOverviewPath(bp: BlockPackageNameWithoutVersion): string {
  return `${MainPrefix}${bp.organization}/${bp.package}/overview.json`;
}

export const GlobalOverviewPath = `${MainPrefix}overview.json`;

export const MetaFile = 'meta.json';

export interface PackageOverviewEntry {
  version: string;
  meta: object;
}

export type PackageOverview = PackageOverviewEntry[];

export interface GlobalOverviewEntry {
  organization: string;
  package: string;
  allVersions: string[];
  latestVersion: string;
  latestMeta: object;
}

export type GlobalOverview = GlobalOverviewEntry[];
