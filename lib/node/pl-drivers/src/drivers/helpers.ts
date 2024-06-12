import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import { ClientLogs } from "../clients/logs";
import { LogsDriver } from "./logs_stream";
import { MiLogger } from "@milaboratory/ts-helpers";
import {
  PlClient,
  ResourceId,
  BasicResourceData,
  isNullResourceId,
  valErr,
  getField,
} from "@milaboratory/pl-client-v2";
import { ResourceInfo, createDownloadClient, createLogsClient, createUploadBlobClient, createUploadProgressClient } from "../clients/helpers";
import { UploadDriver } from "./upload";
import { scheduler } from 'node:timers/promises';
import { DownloadUrlDriver } from './download_url';
import { DownloadDriver } from './download_and_logs_blob';

/** Just a helper to create a driver and all clients. */
export function createDownloadUrlDriver(
  client: PlClient,
  logger: MiLogger,
  saveDir: string,
  localStorageIdsToRoot?: Record<string, string>,
): DownloadUrlDriver {
  return new DownloadUrlDriver(
    logger,
    createDownloadClient(logger, client, localStorageIdsToRoot),
    saveDir,
  );
}

/** Just a helper to create a driver and all clients. */
export function createDownloadDriver(
  client: PlClient,
  logger: MiLogger,
  saveDir: string,
  cacheSoftSizeBytes: number,
  nConcurrentDownloads: number = 10,
  localStorageIdsToRoot?: Record<string, string>,
): DownloadDriver {
  return new DownloadDriver(
    logger,
    createDownloadClient(logger, client, localStorageIdsToRoot),
    createLogsClient(client, logger),
    saveDir,
    cacheSoftSizeBytes,
    nConcurrentDownloads,
  );
}

/** Just a helper to create a driver and all clients. */
export function createUploadDriver(
  client: PlClient,
  logger: MiLogger,
  signFn: (path: string) => Promise<string>,
): UploadDriver {
  return new UploadDriver(
    logger,
    signFn,
    client,
    createUploadBlobClient(client, logger),
    createUploadProgressClient(client, logger),
  );
}

/** Just a helper to create a driver and all clients. */
export function createLogsDriver(
  client: PlClient,
  logger: MiLogger,
): LogsDriver {
  return new LogsDriver(createLogsClient(client, logger));
}

// TODO: remove this when we switch to refreshState.

/** It's an Updater but for tasks that happens in a while loop with sleeping between. */
export class LongUpdater {
  private updater: Updater;

  constructor(
    private readonly onUpdate: () => Promise<boolean>,
    private readonly sleepMs: number,
  ) {
    this.updater = new Updater(
      async () => {
        while (true) {
          const done = await this.onUpdate();
          if (done)
            return
          await scheduler.wait(this.sleepMs);
        }
      }
    )
  }

  schedule = () => this.updater.schedule();
}

/** Updater incorporates a pattern when someone wants to run a callback
 * that updates something only when it's not already running. */
export class Updater {
  private updating: Promise<void> | undefined;

  constructor(private readonly onUpdate: () => Promise<void>) {}

  schedule() {
    if (this.updating == undefined) {
      this.updating = (async () => {
        try {
          await this.onUpdate();
        } catch (e) {
          console.log(`error while updating in Updater: ${e}`)
        } finally {
          this.updating = undefined;
        }
      })()
    }
  }
}

// TODO: remove all the code below to the computable that calculates Mixcr logs.

export async function getStream(
  client: PlClient,
  streamManagerId: ResourceId,
): Promise<BasicResourceData | undefined> {
  return client.withReadTx("LogsDriverGetStream", async (tx) => {
    const sm = await tx.getResourceData(streamManagerId, true);
    const stream = await valErr(tx, getField(sm, 'stream'));
    if (stream.error != '') {
      throw new Error(`while getting stream: ${stream.error}`);
    }
    if (isNullResourceId(stream.valueId))
      return undefined;

    return await tx.getResourceData(stream.valueId, false);
  })
}

export type MixcrProgressResponse =
  | { found: false }
  | ({ found: true } & MixcrProgressLine);

export type MixcrProgressLine = {
  stage: string, // Building pre-clones from tag groups
  progress: string, // 35.3%
  eta: string, // ETA: 00:00:07
};

/** Is set by a template code.
 * Mixcr adds this prefix to every log line that contains a progress. */
const mixcrProgressPrefix = '8C7#F1328%9E089B3D22';
const mixcrProgressRegex = /(?<stage>.*):\s*(?<progress>[\d.]+%)\s.*(?<eta>ETA:.*)/g;

export function lineToProgress(line: string): MixcrProgressLine | undefined {
  const noPrefix = line.replace(mixcrProgressPrefix, '');
  const parsed = noPrefix.match(mixcrProgressRegex);

  if (parsed == null || parsed.length != 4) {
    return undefined;
  }

  const [_, stage, progress, eta] = parsed;

  return {
    stage, // For example, 'Building pre-clones from tag groups'
    progress, // 35.3%
    eta, // ETA: 00:00:07
  };
}

export async function mixcrProgressFromLogs(
  rInfo: ResourceInfo,
  client: ClientLogs,
  options?: RpcOptions,
): Promise<MixcrProgressResponse> {
  const lastLines = await client.lastLines(rInfo, 1, 0n, mixcrProgressPrefix, options);
  if (lastLines.data == null || lastLines.data.length == 0) {
    return { found: false };
  }

  const line = lastLines.data.toString().split(/\r?\n/)[0];
  if (line == undefined) {
    return { found: false };
  }

  const progress = lineToProgress(line);
  if (progress === undefined) {
    return { found: false };
  }

  return { found: true, ...progress };
}
