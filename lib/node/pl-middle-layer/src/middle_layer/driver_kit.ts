import { PlClient } from '@milaboratories/pl-client';
import {
  createDownloadClient,
  createLogsClient,
  createLsFilesClient,
  createUploadBlobClient,
  createUploadProgressClient,
  DefaultVirtualLocalStorages,
  DownloadDriver,
  InternalLsDriver,
  LogsDriver,
  LogsStreamDriver,
  LsDriver,
  OpenFileDialogCallback,
  UploadDriver
} from '@milaboratories/pl-drivers';
import * as Sdk from '@milaboratories/pl-model-common';
import { HmacSha256Signer, MiLogger, Signer } from '@milaboratories/ts-helpers';
import * as os from 'node:os';
import { PFrameDriver } from '../pool';
import {
  DefaultDriverKitOpsPaths,
  DefaultDriverKitOpsSettings,
  DriverKitOps,
  DriverKitOpsConstructor
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
  _ops: DriverKitOpsConstructor
): Promise<MiddleLayerDriverKit> {
  const ops: DriverKitOps = {
    ...DefaultDriverKitOpsSettings,
    ...DefaultDriverKitOpsPaths(workdir, await DefaultVirtualLocalStorages()),
    ..._ops
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
    ops.blobDriverOps
  );
  const uploadDriver = new UploadDriver(
    ops.logger,
    signer,
    uploadBlobClient,
    uploadProgressClient,
    ops.uploadDriverOps
  );
  const logsStreamDriver = new LogsStreamDriver(logsClient, ops.logStreamDriverOps);
  const logDriver = new LogsDriver(logsStreamDriver, blobDriver);
  const lsDriver = await LsDriver.init(
    ops.logger,
    pl,
    signer,
    ops.virtualLocalStorages,
    ops.localProjections,
    ops.openFileDialogCallback
  );

  const pFrameDriver = new PFrameDriver(blobDriver);

  return {
    blobDriver,
    logDriver,
    lsDriver,
    signer,
    uploadDriver,
    pFrameDriver
  };
}
