import { PlClient } from '@milaboratories/pl-client';
import { MiLogger } from '@milaboratories/ts-helpers';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { Dispatcher } from 'undici';
import { ClientDownload } from './download';
import { ClientLogs } from './logs';
import { ClientProgress } from './progress';
import { ClientUpload } from './upload';
import { ClientLs } from './ls_api';

export const PL_STORAGE_TO_PATH = process.env.PL_STORAGE_TO_PATH
  ? Object.fromEntries(
      process.env.PL_STORAGE_TO_PATH.split(';').map((kv) => kv.split(':'))
    )
  : {};

export function createDownloadClient(
  logger: MiLogger,
  client: PlClient,
  localStorageIdsToRoot?: Record<string, string>
) {
  if (localStorageIdsToRoot === undefined)
    localStorageIdsToRoot = PL_STORAGE_TO_PATH;
  const clientDownload = client.getDriver({
    name: 'DownloadBlob',
    init: (
      _: PlClient,
      grpcTransport: GrpcTransport,
      httpDispatcher: Dispatcher
    ) =>
      new ClientDownload(
        grpcTransport,
        httpDispatcher,
        logger,
        localStorageIdsToRoot!
      )
  });

  return clientDownload;
}

export function createLogsClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: 'StreamLogs',
    init: (
      _: PlClient,
      grpcTransport: GrpcTransport,
      httpDispatcher: Dispatcher
    ) => new ClientLogs(grpcTransport, httpDispatcher, logger)
  });
}

export function createUploadProgressClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: 'UploadProgress',
    init: (
      _: PlClient,
      grpcTransport: GrpcTransport,
      httpDispatcher: Dispatcher
    ) => new ClientProgress(grpcTransport, httpDispatcher, client, logger)
  });
}

export function createUploadBlobClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: 'UploadBlob',
    init: (
      _: PlClient,
      grpcTransport: GrpcTransport,
      httpDispatcher: Dispatcher
    ) => new ClientUpload(grpcTransport, httpDispatcher, client, logger)
  });
}

export function createLsFilesClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: 'LsFiles',
    init: (
      _client: PlClient,
      grpcTransport: GrpcTransport,
      _httpDispatcher: Dispatcher
    ) => new ClientLs(grpcTransport, logger)
  });
}