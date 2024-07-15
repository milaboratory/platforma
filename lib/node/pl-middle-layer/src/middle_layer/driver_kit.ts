import {
  DownloadDriver,
  InternalLsDriver,
  LogsDriver,
  LogsStreamDriver,
  LsDriver,
  UploadDriver
} from '@milaboratory/pl-drivers';
import { HmacSha256Signer, MiLogger, Signer } from '@milaboratory/ts-helpers';
import * as Sdk from '@milaboratory/sdk-model';
import { DefaultDriverKitOps, DriverKitOps, DriverKitOpsConstructor } from './ops';
import { createDownloadClient } from '@milaboratory/pl-drivers';
import { createLogsClient } from '@milaboratory/pl-drivers';
import { PlClient } from '@milaboratory/pl-client-v2';
import { createUploadBlobClient } from '@milaboratory/pl-drivers';
import { createUploadProgressClient } from '@milaboratory/pl-drivers';
import { createLsFilesClient } from '@milaboratory/pl-drivers';
import { PFrameDriver } from '../pool';

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
  logger: MiLogger,
  _ops: DriverKitOpsConstructor
): Promise<MiddleLayerDriverKit> {
  const ops: DriverKitOps = { ...DefaultDriverKitOps, ..._ops };
  checkStorageNamesDoNotIntersect(ops);

  const signer = new HmacSha256Signer(ops.localSecret);

  const downloadClient = createDownloadClient(logger, pl, ops.platformLocalStorageNameToPath);
  const logsClient = createLogsClient(pl, logger);
  const uploadBlobClient = createUploadBlobClient(pl, logger);
  const uploadProgressClient = createUploadProgressClient(pl, logger);
  const lsClient = createLsFilesClient(pl, logger);

  const blobDriver = new DownloadDriver(
    logger,
    downloadClient,
    logsClient,
    ops.blobDownloadPath,
    signer,
    ops.blobDriverOps
  );
  const uploadDriver = new UploadDriver(
    logger,
    signer,
    uploadBlobClient,
    uploadProgressClient,
    ops.uploadDriverOps
  );
  const logsStreamDriver = new LogsStreamDriver(logsClient, ops.logStreamDriverOps);
  const logDriver = new LogsDriver(logsStreamDriver, blobDriver);
  const lsDriver = new LsDriver(logger, lsClient, pl, signer, ops.localStorageNameToPath);

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

function checkStorageNamesDoNotIntersect(ops: DriverKitOps) {
  const platformStorages = Object.keys(ops.platformLocalStorageNameToPath);
  const intersected = Object.keys(ops.localStorageNameToPath).find((name) =>
    platformStorages.includes(name)
  );
  if (intersected)
    throw new Error(`Platform local storages include one or more local storages: ${intersected}`);
}
