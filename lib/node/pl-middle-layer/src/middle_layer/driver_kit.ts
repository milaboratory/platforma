import type { PlClient } from "@milaboratories/pl-client";
import type { InternalLsDriver } from "@milaboratories/pl-drivers";
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
  DownloadUrlDriver,
} from "@milaboratories/pl-drivers";
import type * as Sdk from "@milaboratories/pl-model-common";
import type { Signer } from "@milaboratories/ts-helpers";
import { isAsyncDisposable } from "@milaboratories/helpers";
import { HmacSha256Signer } from "@milaboratories/ts-helpers";
import type { InternalPFrameDriver } from "../pool";
import { createPFrameDriver } from "../pool";
import type { Recorder } from "@milaboratories/pl-flight-recorder";
import {
  openFlightSession,
  wrapDataDriver,
  wrapModelDriver,
} from "@milaboratories/pl-flight-recorder";
import type { DriverKitOps, DriverKitOpsConstructor } from "./ops";
import { DefaultDriverKitOpsPaths, DefaultDriverKitOpsSettings } from "./ops";

/**
 * Drivers offered by the middle-layer for internal consumers,
 * like configuration rendering routines.
 *
 * This intertface is basically a version of the DriverKit from
 * UI SDK with extended API.
 * */
export interface MiddleLayerDriverKit extends Sdk.DriverKit, AsyncDisposable {
  /** Dispose the driver kit and all its resources. */
  dispose(): Promise<void>;

  // override with wider interface
  readonly blobDriver: DownloadDriver;
  // override with wider interface
  readonly blobToURLDriver: DownloadBlobToURLDriver;
  // override with wider interface
  readonly logDriver: LogsDriver;
  // override with wider interface
  readonly lsDriver: InternalLsDriver;
  // override with wider interface
  readonly pFrameDriver: InternalPFrameDriver;
  // override with wider interface
  readonly frontendDriver: DownloadUrlDriver;

  /**
   * Diagnostics log for the model layer, present only when flight recording is
   * switched on. Render spans are written through it so that a join recorded by
   * the instrumented pFrame driver can be attributed to the block that built it.
   * */
  readonly flightRecorder?: Recorder;

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
  frontendDownloadPath: string,
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

  const blobDriver = await DownloadDriver.init(
    ops.logger,
    downloadClient,
    logsClient,
    ops.blobDownloadPath,
    ops.blobDownloadRangesCachePath,
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

  const rawPFrameDriver = await createPFrameDriver({
    blobDriver,
    logger: ops.logger,
    spillPath: ops.pframesSpillPath,
    cachePath: ops.parquetCachePath,
    options: ops.pFrameDriverOps,
    cacheOps: ops.parquetCacheOps,
  });

  // Every join a block model builds and every row it reads back passes through
  // this one driver, so instrumenting it here covers the whole model layer
  // without touching the call sites. The session is undefined unless recording
  // is switched on, in which case the driver is used exactly as before.
  const flightSession = openFlightSession({ role: "middle-layer" });
  const pFrameDriver: InternalPFrameDriver = flightSession
    ? wrapDataDriver(
        wrapModelDriver(rawPFrameDriver, flightSession.recorder, flightSession.registry),
        flightSession.recorder,
        flightSession.registry,
      )
    : rawPFrameDriver;

  const frontendDownloadDriver = new DownloadUrlDriver(
    ops.logger,
    pl.httpDispatcher,
    frontendDownloadPath,
    signer,
    ops.frontendDownloadDriverOps,
  );

  const driverKit = {
    blobDriver,
    blobToURLDriver: blobToURLDriver,
    logDriver,
    lsDriver,
    signer,
    uploadDriver,
    pFrameDriver,
    frontendDriver: frontendDownloadDriver,
    flightRecorder: flightSession?.recorder,
  };

  const dispose = async () => {
    const disposePromises = Object.values(driverKit).flatMap((driver) =>
      isAsyncDisposable(driver) ? [driver[Symbol.asyncDispose]()] : [],
    );
    await Promise.all(disposePromises);
    flightSession?.close("driver-kit-disposed");
  };

  return {
    ...driverKit,
    dispose,
    [Symbol.asyncDispose]: dispose,
  };
}
