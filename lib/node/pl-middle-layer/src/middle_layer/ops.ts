import type { TemporalSynchronizedTreeOps } from './types';
import type { DownloadDriverOps } from '@milaboratories/pl-drivers';
import type { UploadDriverOps } from '@milaboratories/pl-drivers';
import type { LogsStreamDriverOps } from '@milaboratories/pl-drivers';
import * as os from 'node:os';

/** Options required to initialize full set of middle layer driver kit */
export type DriverKitOps = {
  //
  // Signer
  //

  /**
   * Local secret, that is used to sign and verify different pieces of information
   * that can be used to access local data, like local paths for ongoing uploads.
   *
   * Use {@link MiddleLayer.generateLocalSecret} to generate sufficiently random string.
   * */
  readonly localSecret: string;

  //
  // Blob Driver
  //

  /**
   * Settings related to the download driver making operations with blobs. This driver is also used
   * to download logs when source process terminates and log terns into a blob
   */
  readonly blobDriverOps: DownloadDriverOps;

  /** Common root where to put downloaded blobs. */
  readonly blobDownloadPath: string;

  /**
   * If Platforma is running in local mode and a download driver
   * needs to download files from local storage, it will open files
   * from the specified directory. Otherwise, it should be empty.
   * */
  readonly platformLocalStorageNameToPath: Record<string, string>;

  //
  // Upload Driver
  //

  /**
   * Settings related to the upload driver that actually performs upload and helps render upload
   * and indexing progresses from related pl resources.
   * */
  readonly uploadDriverOps: UploadDriverOps;

  //
  // Log streaming ops
  // (static logs are served via the blob driver)
  //

  /** Settings related to the streaming log driver */
  readonly logStreamDriverOps: LogsStreamDriverOps;

  //
  // LS Driver
  //

  /**
   * If the client wants to upload files from their local machine to Platforma,
   * this option should be set. Set any unique storage names
   * to any paths from where the client will upload files,
   * e.g., {'local': '/'}.
   * */
  readonly localStorageNameToPath: Record<string, string>;
};

/** Some defaults fot MiddleLayerOps. */
export const DefaultDriverKitOps: Pick<
  DriverKitOps,
  | 'platformLocalStorageNameToPath'
  | 'blobDriverOps'
  | 'uploadDriverOps'
  | 'logStreamDriverOps'
  | 'localStorageNameToPath'
> = {
  platformLocalStorageNameToPath: {},
  localStorageNameToPath: { local: os.homedir() },
  blobDriverOps: {
    cacheSoftSizeBytes: 100 * 1024 * 1024, // 100MB
    nConcurrentDownloads: 10
  },
  uploadDriverOps: {
    nConcurrentPartUploads: 10,
    nConcurrentGetProgresses: 10,
    pollingInterval: 1000,
    stopPollingDelay: 1000
  },
  logStreamDriverOps: {
    nConcurrentGetLogs: 10,
    pollingInterval: 1000,
    stopPollingDelay: 1000
  }
};

/** Fields with default values are marked as optional here. */
export type DriverKitOpsConstructor = Omit<DriverKitOps, keyof typeof DefaultDriverKitOps> &
  Partial<typeof DefaultDriverKitOps>;

/** Configuration controlling different aspects of middle layer behaviour. */
export type MiddleLayerOps = DriverKitOps & {
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

  /** Common root where to put frontend code. */
  readonly frontendDownloadPath: string;
};

/** Some defaults fot MiddleLayerOps. */
export const DefaultMiddleLayerOps: Pick<
  MiddleLayerOps,
  | keyof typeof DefaultDriverKitOps
  | 'defaultTreeOptions'
  | 'projectRefreshInterval'
  | 'stagingRenderingRate'
  | 'platformLocalStorageNameToPath'
  | 'devBlockUpdateRecheckInterval'
> = {
  ...DefaultDriverKitOps,
  defaultTreeOptions: {
    pollingInterval: 350,
    stopPollingDelay: 2500
  },
  devBlockUpdateRecheckInterval: 1000,
  projectRefreshInterval: 700,
  stagingRenderingRate: 5
};

/** Fields with default values are marked as optional here. */
export type MiddleLayerOpsConstructor = Omit<MiddleLayerOps, keyof typeof DefaultMiddleLayerOps> &
  Partial<typeof DefaultMiddleLayerOps>;
