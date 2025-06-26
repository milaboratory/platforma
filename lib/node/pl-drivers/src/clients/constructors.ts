import type { GrpcClientProviderFactory, PlClient } from '@milaboratories/pl-client';
import type { MiLogger } from '@milaboratories/ts-helpers';
import type { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { Dispatcher } from 'undici';
import { ClientDownload } from './download';
import { ClientLogs } from './logs';
import { ClientProgress } from './progress';
import { ClientUpload } from './upload';
import { ClientLs } from './ls_api';
import type { LocalStorageProjection } from '../drivers/types';

export function createDownloadClient(
  logger: MiLogger,
  client: PlClient,
  localProjections: LocalStorageProjection[],
) {
  return client.getDriver({
    name: 'DownloadBlob',
    init: (_: PlClient, grpcClientProviderFactory: GrpcClientProviderFactory, httpDispatcher: Dispatcher) =>
      new ClientDownload(grpcClientProviderFactory, httpDispatcher, logger, localProjections),
  });
}

export function createLogsClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: 'StreamLogs',
    init: (_: PlClient, grpcClientProviderFactory: GrpcClientProviderFactory, httpDispatcher: Dispatcher) =>
      new ClientLogs(grpcClientProviderFactory, httpDispatcher, logger),
  });
}

export function createUploadProgressClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: 'UploadProgress',
    init: (_: PlClient, grpcClientProviderFactory: GrpcClientProviderFactory, httpDispatcher: Dispatcher) =>
      new ClientProgress(grpcClientProviderFactory, httpDispatcher, client, logger),
  });
}

export function createUploadBlobClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: 'UploadBlob',
    init: (_: PlClient, grpcClientProviderFactory: GrpcClientProviderFactory, httpDispatcher: Dispatcher) =>
      new ClientUpload(grpcClientProviderFactory, httpDispatcher, client, logger),
  });
}

export function createLsFilesClient(client: PlClient, logger: MiLogger) {
  return client.getDriver({
    name: 'LsFiles',
    init: (_client: PlClient, grpcClientProviderFactory: GrpcClientProviderFactory, _httpDispatcher: Dispatcher) =>
      new ClientLs(grpcClientProviderFactory, logger),
  });
}
