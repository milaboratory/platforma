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

  /** How often to check for dev block updates */
  readonly devBlockUpdateRecheckInterval: number;

  /** Local secret, that is used to sign and verify different pieces of information
   * that can be used to access local data, like local paths for ongoing uploads.
   *
   * Use {@link MiddleLayer.generateLocalSecret} to generate sufficiently random string. */
  readonly localSecret: string,

  /** Common root where to put frontend code. */
  readonly frontendDownloadPath: string;

  /** Common root where to put downloaded blobs. */
  readonly blobDownloadPath: string;

  /** If the platform is running in local mode and a download driver
   * needs to download files from local storage, it will open files
   * from the specified directory. Otherwise, it should be empty. */
  readonly localStorageIdsToRoot: Record<string, string>;

  /** The number of downloads that can be done in parallel when downloading blobs. */
  readonly nConcurrentBlobDownloads: number;

  /** A soft limit of the amount of blob storage, in bytes.
   * Once exceeded, the download driver will start deleting blobs one by one
   * when they become unneeded. */
  readonly blobDownloadCacheSizeBytes: number;

  /** How much parts of a file can be multipart-uploaded to S3 at once. */
  nConcurrentPartUploads: number;

  /** How much upload/indexing statuses of blobs can the upload driver ask
   * from the platform gRPC at once. */
  nConcurrentGetProgresses: number;

  defaultUploadDriverOptions: {
    /** How frequent the upload driver should update statuses of progresses. */
    pollingInterval: number;
    /** For how long to continue polling after the last derived value access. */
    stopPollingDelay: number;
  }

  /** How much logs updates can the logs driver ask
   * from the platform gRPC at once. */
  nConcurrentGetLogs: number;
  defaultStreamLogsDriverOptions: {
    /** How frequent the upload driver should update statuses of progresses. */
    pollingInterval: number;
    /** For how long to continue polling after the last derived value access. */
    stopPollingDelay: number;
  }
}

/** Some defaults fot MiddleLayerOps. */
export const DefaultMiddleLayerOps: Pick<MiddleLayerOps,
  | 'defaultTreeOptions'
  | 'projectRefreshInterval'
  | 'stagingRenderingRate'
  | 'localStorageIdsToRoot'
  | 'nConcurrentBlobDownloads'
  | 'blobDownloadCacheSizeBytes'
  | 'defaultUploadDriverOptions'
  | 'nConcurrentGetProgresses'
  | 'nConcurrentPartUploads'
  | 'nConcurrentGetLogs'
  | 'defaultStreamLogsDriverOptions'
  | 'devBlockUpdateRecheckInterval'> = {
  defaultTreeOptions: {
    pollingInterval: 350,
    stopPollingDelay: 2500
  },
  devBlockUpdateRecheckInterval: 1000,
  projectRefreshInterval: 700,
  stagingRenderingRate: 5,
  localStorageIdsToRoot: {},
  nConcurrentBlobDownloads: 10,
  blobDownloadCacheSizeBytes: 100 * 1024 * 1024, // 100MB
  nConcurrentPartUploads: 10,
  nConcurrentGetProgresses: 10,
  defaultUploadDriverOptions: {
    pollingInterval: 1000,
    stopPollingDelay: 1000
  },
  nConcurrentGetLogs: 10,
  defaultStreamLogsDriverOptions: {
    pollingInterval: 1000,
    stopPollingDelay: 1000
  }
};

/** Fields with default values are marked as optional here. */
export type MiddleLayerOpsConstructor =
  Omit<MiddleLayerOps, keyof typeof DefaultMiddleLayerOps>
  & Partial<typeof DefaultMiddleLayerOps>
