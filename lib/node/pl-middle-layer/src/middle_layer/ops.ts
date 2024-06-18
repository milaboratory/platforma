import { TemporalSynchronizedTreeOps } from './types';

/** Configuration controlling different aspects of middle layer behaviour. */
export type MiddleLayerOps = {
  /** Contain temporal options controlling how often should pl trees be
   * synchronized with the pl server. */
  readonly defaultTreeOptions: TemporalSynchronizedTreeOps;

  /** Defines interval in milliseconds for running periodic project maintenance job.
   * Project maintenance includes gradual staging rendering and cached outputs cleanup. */
  readonly projectRefreshInterval: number;

  /** This controls average number of block staging states that are rendered per
   * second during project maintenance job execution. */
  readonly stagingRenderingRate: number;

  /** Local secret, that is used to sign and verify different pieces of information
   * that can be used to access local data, like local paths for ongoing uploads. */
  readonly localSecret: string,

  /** Common root where to put frontend code. */
  readonly frontendDownloadPath: string;

  /** Common root where to put downloaded blobs. */
  readonly blobDownloadPath: string;

  /** If the platform is running in local mode and a download driver 
   * needs to download files from local storage, it will open files 
   * from the specified directory. Otherwise is should be empty. */
  readonly localStorageIdsToRoot: Record<string, string>;

  /** The number of downloads that can be done in parallel when downloading blobs. */
  readonly nConcurrentBlobDownloads: number;

  /** A soft limit of the amount of blob storage, in bytes.
   * Once exceeded, the download driver will start deleting blobs one by one
   * when they become unneeded. */
  readonly blobDownloadCacheSizeBytes: number;
}

/** Some defaults fot MiddleLayerOps. */
export const DefaultMiddleLayerOps: Pick<MiddleLayerOps,
  | 'defaultTreeOptions'
  | 'projectRefreshInterval'
  | 'stagingRenderingRate'
  | 'localStorageIdsToRoot'
  | 'nConcurrentBlobDownloads'
  | 'blobDownloadCacheSizeBytes'> = {
    defaultTreeOptions: {
      pollingInterval: 350,
      stopPollingDelay: 2500
    },
    projectRefreshInterval: 700,
    stagingRenderingRate: 5,
    localStorageIdsToRoot: {},
    nConcurrentBlobDownloads: 10,
    blobDownloadCacheSizeBytes: 100 * 1024 * 1024 // 100MB
  };

/** Fields with default values are marked as optional here. */
export type MiddleLayerOpsConstructor =
  Omit<MiddleLayerOps, keyof typeof DefaultMiddleLayerOps>
  & Partial<typeof DefaultMiddleLayerOps>
