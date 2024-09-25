import type { PlClient } from '@milaboratories/pl-client';
import type {
  InternalLsDriver} from '@milaboratories/pl-drivers';
import {
  createDownloadClient, createLogsClient, createLsFilesClient, createUploadBlobClient, createUploadProgressClient, DownloadDriver,
  LogsDriver,
  LogsStreamDriver,
  LsDriver,
  UploadDriver
} from '@milaboratories/pl-drivers';
import type * as Sdk from '@milaboratories/pl-model-common';
import type { MiLogger, Signer } from '@milaboratories/ts-helpers';
import { HmacSha256Signer } from '@milaboratories/ts-helpers';
import * as os from 'node:os';
import { PFrameDriver } from '../pool';
import type { DriverKitOps, DriverKitOpsConstructor } from './ops';
import { DefaultDriverKitOps } from './ops';

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
  checkStorageNamesDoNotIntersect(logger, ops);

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

function checkStorageNamesDoNotIntersect(logger: MiLogger, ops: DriverKitOps) {
  if (ops.localStorageNameToPath.local != os.homedir())
    logger.warn(`'local' storage with homedir was overwrote: ${ops.localStorageNameToPath.local}`);

  const platformStorages = Object.keys(ops.platformLocalStorageNameToPath);
  const intersected = Object.keys(ops.localStorageNameToPath).find((name) =>
    platformStorages.includes(name)
  );

  if (intersected)
    throw new Error(
      `Platform local storages include one or more local storages: ` +
        ` ${intersected}. Note that we automatically included 'local' storage with user's home directory.`
    );
}
