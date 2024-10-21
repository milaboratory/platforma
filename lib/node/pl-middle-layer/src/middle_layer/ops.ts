import { TemporalSynchronizedTreeOps } from './types';
import {
  DefaultVirtualLocalStorages,
  DownloadDriverOps,
  OpenFileDialogCallback,
  VirtualLocalStorageSpec
} from '@milaboratories/pl-drivers';
import { UploadDriverOps } from '@milaboratories/pl-drivers';
import { LogsStreamDriverOps } from '@milaboratories/pl-drivers';
import { ConsoleLoggerAdapter, MiLogger } from '@milaboratories/ts-helpers';
import { LocalStorageProjection } from '@milaboratories/pl-drivers';
import path from 'node:path';

/** Paths part of {@link DriverKitOps}. */
export type DriverKitOpsPaths = {
  /** Common root where to put downloaded blobs / downloaded blob cache */
  readonly blobDownloadPath: string;

  /**
   * List of pl storages that have projections in local file system.
   *
   * This option affect two drivers:
   *
   *   (1) LS driver generates "index" handles instead of "upload" for paths inside those locations
   *
   *   (2) Download driver directly serves content retrieval requests for blobs from listed storages,
   *       and don't apply any caching for such blobs (i.e. preventing duplication of files for Downloaded
   *       type handles, making OnDemand and Downloaded handles equivalent)
   *
   * */
  readonly localProjections: LocalStorageProjection[];

  /**
   * List of virtual storages that will allow homogeneous access to local FSs through LS API.
   * If undefined, default list will be created.
   * */
  readonly virtualLocalStoragesOverride?: VirtualLocalStorageSpec[];
};

/** Options required to initialize full set of middle layer driver kit */
export type DriverKitOpsSettings = {
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

export type DriverKitOps = DriverKitOpsPaths & DriverKitOpsSettings;

/** Some defaults fot MiddleLayerOps. */
export const DefaultDriverKitOpsSettings: Pick<
  DriverKitOpsSettings,
  'logger' | 'blobDriverOps' | 'uploadDriverOps' | 'logStreamDriverOps'
> = {
  logger: new ConsoleLoggerAdapter(),
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

export function DefaultDriverKitOpsPaths(
  workDir: string
): Pick<DriverKitOpsPaths, 'blobDownloadPath'> {
  return {
    blobDownloadPath: path.join(workDir, 'download')
  };
}

/** Fields with default values are marked as optional here. */
// prettier-ignore
export type DriverKitOpsConstructor =
  Omit<DriverKitOpsSettings, keyof typeof DefaultDriverKitOpsSettings>
  & Partial<typeof DefaultDriverKitOpsSettings>
  & Omit<DriverKitOpsPaths, keyof ReturnType<typeof DefaultDriverKitOpsPaths>>
  & Partial<ReturnType<typeof DefaultDriverKitOpsPaths>>;

export type MiddleLayerOpsPaths = DriverKitOpsPaths & {
  /** Common root where to put frontend code. */
  readonly frontendDownloadPath: string;
};

/** Configuration controlling different aspects of middle layer behaviour. */
export type MiddleLayerOpsSettings = DriverKitOpsSettings & {
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

export type MiddleLayerOps = MiddleLayerOpsSettings & MiddleLayerOpsPaths;

/** Some defaults fot MiddleLayerOps. */
export const DefaultMiddleLayerOpsSettings: Pick<
  MiddleLayerOps,
  | keyof typeof DefaultDriverKitOpsSettings
  | 'defaultTreeOptions'
  | 'projectRefreshInterval'
  | 'stagingRenderingRate'
  | 'devBlockUpdateRecheckInterval'
> = {
  ...DefaultDriverKitOpsSettings,
  defaultTreeOptions: {
    pollingInterval: 350,
    stopPollingDelay: 2500
  },
  devBlockUpdateRecheckInterval: 1000,
  projectRefreshInterval: 700,
  stagingRenderingRate: 5
};

export function DefaultMiddleLayerOpsPaths(
  workDir: string
): Pick<
  MiddleLayerOpsPaths,
  keyof ReturnType<typeof DefaultDriverKitOpsPaths> | 'frontendDownloadPath'
> {
  return {
    ...DefaultDriverKitOpsPaths(workDir),
    frontendDownloadPath: path.join(workDir, 'frontend')
  };
}

export type MiddleLayerOpsConstructor = Omit<
  MiddleLayerOpsSettings,
  keyof typeof DefaultMiddleLayerOpsSettings
> &
  Partial<typeof DefaultMiddleLayerOpsSettings> &
  Omit<MiddleLayerOpsPaths, keyof Awaited<ReturnType<typeof DefaultMiddleLayerOpsPaths>>> &
  Partial<Awaited<ReturnType<typeof DefaultMiddleLayerOpsPaths>>>;
