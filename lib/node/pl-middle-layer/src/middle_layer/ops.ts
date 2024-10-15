import { TemporalSynchronizedTreeOps } from './types';
import { DownloadDriverOps, OpenFileDialogCallback } from '@milaboratories/pl-drivers';
import { UploadDriverOps } from '@milaboratories/pl-drivers';
import { LogsStreamDriverOps } from '@milaboratories/pl-drivers';
import { ConsoleLoggerAdapter, MiLogger } from '@milaboratories/ts-helpers';
import * as os from 'node:os';

/** Paths part of {@link DriverKitOps}. */
export type DriverKitOpsPaths = {
  /** Common root where to put downloaded blobs / downloaded blob cache */
  readonly blobDownloadPath: string;

  /**
   * If Platforma is running in local mode and a download driver
   * needs to download files from local storage, it will open files
   * from the specified directory. Otherwise, setting should be empty.
   *
   * storage_name -> local_path
   * */
  readonly downloadLocalStorageNameToPath: Record<string, string>;

  /**
   * If the client wants to upload files from their local machine to Platforma,
   * this option should be set. Set any unique storage names
   * to any paths from where the client will upload files,
   * e.g., {'local': '/'}.
   *
   * storage_name -> local_path
   * */
  readonly uploadLocalStorageNameToPath: Record<string, string>;
};

/** Options required to initialize full set of middle layer driver kit */
export type DriverKitOps = DriverKitOpsPaths & {
  //
  // Common
  //

  readonly logger: MiLogger;

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
   * Callback to access system file open dialog, must be provided by the environment,
   * to allow for {@link showOpenSingleFileDialog} / {@link showOpenMultipleFilesDialog}
   * calls from the UI.
   */
  readonly openFileDialogCallback: OpenFileDialogCallback;
};

/** Some defaults fot MiddleLayerOps. */
export const DefaultDriverKitOps: Pick<
  DriverKitOps,
  | 'logger'
  | 'downloadLocalStorageNameToPath'
  | 'blobDriverOps'
  | 'uploadDriverOps'
  | 'logStreamDriverOps'
  | 'uploadLocalStorageNameToPath'
> = {
  logger: new ConsoleLoggerAdapter(),
  downloadLocalStorageNameToPath: {},
  uploadLocalStorageNameToPath: { local: os.homedir() }, // TODO ???
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

export type MiddleLayerOpsPaths = DriverKitOpsPaths & {
  /** Common root where to put frontend code. */
  readonly frontendDownloadPath: string;
}

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
};

/** Some defaults fot MiddleLayerOps. */
export const DefaultMiddleLayerOps: Pick<
  MiddleLayerOps,
  | keyof typeof DefaultDriverKitOps
  | 'defaultTreeOptions'
  | 'projectRefreshInterval'
  | 'stagingRenderingRate'
  | 'downloadLocalStorageNameToPath'
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
