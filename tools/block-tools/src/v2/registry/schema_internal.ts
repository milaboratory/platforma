import { BlockPackId } from '@milaboratories/pl-model-middle-layer';

export const VersionUpdatesPrefix = '_updates_v2/per_package_version/';

export function packageUpdateSeedPath(bp: BlockPackId, seed: string): string {
  return `${VersionUpdatesPrefix}${bp.organization}/${bp.name}/${bp.version}/${seed}`;
}

export const PackageUpdatePattern =
  /(?<packageKeyWithoutVersion>(?<organization>[^\/]+)\/(?<name>[^\/]+))\/(?<version>[^\/]+)\/(?<seed>[^\/]+)$/;

export const GlobalUpdateSeedInFile = '_updates_v2/_global_update_in';
export const GlobalUpdateSeedOutFile = '_updates_v2/_global_update_out';
