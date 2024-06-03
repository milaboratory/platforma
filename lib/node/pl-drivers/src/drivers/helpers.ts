import { PlClient } from "@milaboratory/pl-client-v2";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { Dispatcher } from "undici";
import { ClientBlob } from "../clients/blob";
import { MiLogger } from "@milaboratory/ts-helpers";
import { ClientProgress } from "../clients/progress";
import { UploadDriver } from "./upload";
import { DownloadDriver } from "./download";
import { ClientDownload } from "../clients/download";
import { ClientLogs } from "../clients/logs";
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import { LogsDriver } from "./logs";
import { ResourceInfo } from "../clients/helpers";

/** Just a helper to create a driver and all clients. */
export async function createDownloadDriver(
  client: PlClient,
  logger: MiLogger,
  localStorageIdsToRoot: Record<string, string>,
  saveDir: string,
  cacheSoftSizeBytes: number,
  nConcurrentDownloads: number = 10,
): Promise<DownloadDriver> {
  const clientDownload = client.getDriver({
    name: 'DownloadBlob',
    init: (pl: PlClient, grpcTransport: GrpcTransport, httpDispatcher: Dispatcher) =>
      new ClientDownload(grpcTransport, httpDispatcher, logger, localStorageIdsToRoot)
  })

  return new DownloadDriver(
    clientDownload,
    saveDir,
    cacheSoftSizeBytes,
    nConcurrentDownloads,
  );
}

/** Just a helper to create a driver and all clients. */
export async function createDriver(
  client: PlClient,
  logger: MiLogger,
  signFn: (path: string) => Promise<string>,
): Promise<UploadDriver> {
  const clientBlob = client.getDriver({
    name: 'UploadBlob',
    init: (pl: PlClient, grpcTransport: GrpcTransport, httpDispatcher: Dispatcher) =>
      new ClientBlob(grpcTransport, httpDispatcher, client, logger)
  })
  const clientProgress = client.getDriver({
    name: 'UploadProgress',
    init: (pl: PlClient, grpcTransport: GrpcTransport, httpDispatcher: Dispatcher) =>
      new ClientProgress(grpcTransport, httpDispatcher, client, logger)
  })

  return new UploadDriver(
    logger,
    signFn,
    client, clientBlob, clientProgress
  );
}

/** Just a helper to create a driver and all clients. */
export async function createLogsDriver(
  client: PlClient,
  logger: MiLogger,
): Promise<LogsDriver> {
  const clientLogs = client.getDriver({
    name: 'StreamLogs',
    init: (pl: PlClient, grpcTransport: GrpcTransport, httpDispatcher: Dispatcher) =>
      new ClientLogs(grpcTransport, httpDispatcher, logger)
  })

  return new LogsDriver(client, clientLogs);
}

// TODO: remove all the code below to the computable that calculates Mixcr logs.

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
