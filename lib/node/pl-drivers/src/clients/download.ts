import { addRTypeToMetadata } from '@milaboratories/pl-client';
import { ResourceInfo } from '@milaboratories/pl-tree';
import { MiLogger } from '@milaboratories/ts-helpers';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { Dispatcher } from 'undici';
import { LocalStorageProjection } from '../drivers/types';
import { DownloadResponse, RemoteFileDownloader } from '../helpers/download';
import { validateAbsolute } from '../helpers/validate';
import { DownloadAPI_GetDownloadURL_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/downloadapi/protocol';
import { DownloadClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/downloadapi/protocol.client';
import { toHeadersMap } from './helpers';

/** Gets URLs for downloading from pl-core, parses them and reads or downloads
 * files locally and from the web. */
export class ClientDownload {
  public readonly grpcClient: DownloadClient;
  private readonly remoteFileDownloader: RemoteFileDownloader;

  /** Helps to find a storage root directory by a storage id from URL scheme. */
  private readonly localStorageIdsToRoot: Map<string, string>;

  constructor(
    public readonly grpcTransport: GrpcTransport,
    public readonly httpClient: Dispatcher,
    public readonly logger: MiLogger,
    /** Pl storages available locally */
    localProjections: LocalStorageProjection[]
  ) {
    this.grpcClient = new DownloadClient(this.grpcTransport);
    this.remoteFileDownloader = new RemoteFileDownloader(httpClient);
    this.localStorageIdsToRoot = newLocalStorageIdsToRoot(localProjections);
  }

  close() {}

  async downloadBlob(
    info: ResourceInfo,
    options?: RpcOptions,
    signal?: AbortSignal
  ): Promise<DownloadResponse> {
    const { downloadUrl, headers } = await this.grpcGetDownloadUrl(info, options, signal);

    this.logger.info(`download blob from url ${downloadUrl}`);

    return isLocal(downloadUrl)
      ? await this.readLocalFile(downloadUrl)
      : await this.remoteFileDownloader.download(downloadUrl, toHeadersMap(headers), signal);
  }

  async readLocalFile(url: string): Promise<DownloadResponse> {
    const { storageId, relativePath } = parseLocalUrl(url);
    const fullPath = getFullPath(storageId, this.localStorageIdsToRoot, relativePath);

    return {
      content: Readable.toWeb(fs.createReadStream(fullPath)),
      size: (await fsp.stat(fullPath)).size
    };
  }

  private async grpcGetDownloadUrl(
    { id, type }: ResourceInfo,
    options?: RpcOptions,
    signal?: AbortSignal
  ): Promise<DownloadAPI_GetDownloadURL_Response> {
    const withAbort = options ?? {};
    withAbort.abort = signal;

    return await this.grpcClient.getDownloadURL(
      { resourceId: id },
      addRTypeToMetadata(type, withAbort)
    ).response;
  }
}

export function parseLocalUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.pathname == '')
    throw new WrongLocalFileUrl(`url for local filepath ${url} does not match url scheme`);

  return {
    storageId: parsed.host,
    relativePath: decodeURIComponent(parsed.pathname.slice(1))
  };
}

export function getFullPath(
  storageId: string,
  localStorageIdsToRoot: Map<string, string>,
  relativePath: string
) {
  const root = localStorageIdsToRoot.get(storageId);
  if (root === undefined) throw new UnknownStorageError(`Unknown storage location: ${storageId}`);

  if (root === '') return relativePath;

  return path.join(root, relativePath);
}

const storageProtocol = 'storage://';
function isLocal(url: string) {
  return url.startsWith(storageProtocol);
}

/** Throws when a local URL have invalid scheme. */
export class WrongLocalFileUrl extends Error {}

/** Happens when a storage for a local file can't be found.  */
export class UnknownStorageError extends Error {}

export function newLocalStorageIdsToRoot(projections: LocalStorageProjection[]) {
  const idToRoot: Map<string, string> = new Map();
  for (const lp of projections) {
    // Empty string means no prefix, i.e. any file on this machine can be got from the storage.
    if (lp.localPath !== '') {
      validateAbsolute(lp.localPath);
    }
    idToRoot.set(lp.storageId, lp.localPath);
  }

  return idToRoot;
}
