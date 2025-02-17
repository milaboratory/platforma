import type { PlClient } from '@milaboratories/pl-client';
import type {
  InternalLsDriver } from '@milaboratories/pl-drivers';
import {
  createDownloadClient,
  createLogsClient,
  createUploadBlobClient,
  createUploadProgressClient,
  DownloadDriver,
  DownloadBlobToURLDriver,
  LogsDriver,
  LogsStreamDriver,
  LsDriver,
  UploadDriver,
} from '@milaboratories/pl-drivers';
import type * as Sdk from '@milaboratories/pl-model-common';
import type { Signer } from '@milaboratories/ts-helpers';
import { HmacSha256Signer } from '@milaboratories/ts-helpers';
import { PFrameDriver } from '../pool';
import type {
  DriverKitOps,
  DriverKitOpsConstructor,
} from './ops';
import {
  DefaultDriverKitOpsPaths,
  DefaultDriverKitOpsSettings,
} from './ops';

/**
 * Drivers offered by the middle-layer for internal consumers,
 * like configuration rendering routines.
 *
 * This intertface is basically a version of the DriverKit from
 * UI SDK with extended API.
 * */
export interface MiddleLayerDriverKit extends Sdk.DriverKit {
  // override with wider interface
  readonly blobDriver: DownloadDriver;
  // override with wider interface
  readonly blobToURLDriver: DownloadBlobToURLDriver;
  // override with wider interface
  readonly logDriver: LogsDriver;
  // override with wider interface
  readonly lsDriver: InternalLsDriver;
  // override with wider interface
  readonly pFrameDriver: PFrameDriver;

  /**
   * Signer is initialized from local secret in drivers initialization routine,
   * so constitutes a part of the driver kit
   * */
  readonly signer: Signer;

  /**
   * Used to retrieve upload progress, and initiate upload porecesses driven by
   * upload requests from block outputs.
   * */
  readonly uploadDriver: UploadDriver;
}

export async function initDriverKit(
  pl: PlClient,
  workdir: string,
  _ops: DriverKitOpsConstructor,
): Promise<MiddleLayerDriverKit> {
  const ops: DriverKitOps = {
    ...DefaultDriverKitOpsSettings,
    ...DefaultDriverKitOpsPaths(workdir),
    ..._ops,
  };

  const signer = new HmacSha256Signer(ops.localSecret);

  const downloadClient = createDownloadClient(ops.logger, pl, ops.localProjections);
  const logsClient = createLogsClient(pl, ops.logger);
  const uploadBlobClient = createUploadBlobClient(pl, ops.logger);
  const uploadProgressClient = createUploadProgressClient(pl, ops.logger);

  const blobDriver = new DownloadDriver(
    ops.logger,
    downloadClient,
    logsClient,
    ops.blobDownloadPath,
    signer,
    ops.blobDriverOps,
  );

  const blobToURLDriver = new DownloadBlobToURLDriver(
    ops.logger,
    signer,
    downloadClient,
    ops.downloadBlobToURLPath,
    ops.downloadBlobToURLDriverOps,
  );

  const uploadDriver = new UploadDriver(
    ops.logger,
    signer,
    uploadBlobClient,
    uploadProgressClient,
    ops.uploadDriverOps,
  );
  const logsStreamDriver = new LogsStreamDriver(ops.logger, logsClient, ops.logStreamDriverOps);
  const logDriver = new LogsDriver(ops.logger, logsStreamDriver, blobDriver);
  const lsDriver = await LsDriver.init(
    ops.logger,
    pl,
    signer,
    ops.localProjections,
    ops.openFileDialogCallback,
    ops.virtualLocalStoragesOverride,
  );

  const pFrameDriver = new PFrameDriver(blobDriver, ops.logger);

  return {
    blobDriver,
    blobToURLDriver: blobToURLDriver,
    logDriver,
    lsDriver,
    signer,
    uploadDriver,
    pFrameDriver,
  };
}
