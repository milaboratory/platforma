import type { BlockPackId, BlockPackIdNoVersion } from "@milaboratories/pl-model-middle-layer";

export const VersionUpdatesPrefix = "_updates_v2/per_package_version/";

export function packageUpdateSeedPath(bp: BlockPackId, seed: string): string {
  return `${VersionUpdatesPrefix}${bp.organization}/${bp.name}/${bp.version}/${seed}`;
}

export const PackageUpdatePattern =
  /(?<packageKeyWithoutVersion>(?<organization>[^/]+)\/(?<name>[^/]+))\/(?<version>[^/]+)\/(?<seed>[^/]+)$/;

export const GlobalUpdateSeedInFile = "_updates_v2/_global_update_in";
export const GlobalUpdateSeedOutFile = "_updates_v2/_global_update_out";

// Snapshot storage structure
export const OverviewSnapshotsPrefix = "_overview_snapshots_v2/";
export const GlobalSnapshotsPrefix = "_overview_snapshots_v2/global/";
export const PackageSnapshotsPrefix = "_overview_snapshots_v2/per_package/";

export const GlobalOverviewSnapshotPattern =
  /^(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[a-z0-9]+)\.json\.gz$/;

export function globalOverviewSnapshotPath(timestamp: string): string {
  return `${GlobalSnapshotsPrefix}${timestamp}.json.gz`;
}

export function packageOverviewSnapshotPath(bp: BlockPackIdNoVersion, timestamp: string): string {
  return `${PackageSnapshotsPrefix}${bp.organization}/${bp.name}/${timestamp}.json.gz`;
}
