import type { WireClientProviderFactory, PlClient } from "@milaboratories/pl-client";
import type { MiLogger } from "@milaboratories/ts-helpers";
import type { Dispatcher } from "undici";
import { ClientDownload } from "./download";
import { ClientLogs } from "./logs";
import { ClientProgress } from "./progress";
import { ClientUpload } from "./upload";
import { ClientLs } from "./ls_api";
import type { LocalStorageProjection } from "../drivers/types";

export function createDownloadClient(
  logger: MiLogger,
  client: PlClient,
  localProjections: LocalStorageProjection[],
) {
  return client.getDriver({
    name: "DownloadBlob",
    init: (_: PlClient, wireClientFactory: WireClientProviderFactory, httpDispatcher: Dispatcher) =>
      new ClientDownload(wireClientFactory, httpDispatcher, logger, localProjections),
  });
}

export function createLogsClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: "StreamLogs",
    init: (_: PlClient, wireClientFactory: WireClientProviderFactory, httpDispatcher: Dispatcher) =>
      new ClientLogs(wireClientFactory, httpDispatcher, logger),
  });
}

export function createUploadProgressClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: "UploadProgress",
    init: (_: PlClient, wireClientFactory: WireClientProviderFactory, httpDispatcher: Dispatcher) =>
      new ClientProgress(wireClientFactory, httpDispatcher, client, logger),
  });
}

export function createUploadBlobClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: "UploadBlob",
    init: (_: PlClient, wireClientFactory: WireClientProviderFactory, httpDispatcher: Dispatcher) =>
      new ClientUpload(wireClientFactory, httpDispatcher, client, logger),
  });
}

export function createLsFilesClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: "LsFiles",
    init: (
      _client: PlClient,
      wireClientFactory: WireClientProviderFactory,
      _httpDispatcher: Dispatcher,
    ) => new ClientLs(wireClientFactory, logger),
  });
}
