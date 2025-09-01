/* eslint-disable n/no-unsupported-features/node-builtins */
import type { GrpcClientProvider, GrpcClientProviderFactory } from '@milaboratories/pl-client';
import { addRTypeToMetadata, stringifyWithResourceId } from '@milaboratories/pl-client';
import type { ResourceInfo } from '@milaboratories/pl-tree';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { ConcurrencyLimitingExecutor } from '@milaboratories/ts-helpers';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import type { Dispatcher } from 'undici';
import type { LocalStorageProjection } from '../drivers/types';
import { type ContentHandler, RemoteFileDownloader } from '../helpers/download';
import { validateAbsolute } from '../helpers/validate';
import type { DownloadAPI_GetDownloadURL_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/downloadapi/protocol';
import { DownloadClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/downloadapi/protocol.client';
import { type GetContentOptions } from '@milaboratories/pl-model-common';

/** Gets URLs for downloading from pl-core, parses them and reads or downloads
 * files locally and from the web. */
export class ClientDownload {
  public readonly grpcClient: GrpcClientProvider<DownloadClient>;
  private readonly remoteFileDownloader: RemoteFileDownloader;

  /** Helps to find a storage root directory by a storage id from URL scheme. */
  private readonly localStorageIdsToRoot: Map<string, string>;

  /** Concurrency limiter for local file reads - limit to 32 parallel reads */
  private readonly localFileReadLimiter = new ConcurrencyLimitingExecutor(32);

  constructor(
    grpcClientProviderFactory: GrpcClientProviderFactory,
    public readonly httpClient: Dispatcher,
    public readonly logger: MiLogger,
    /** Pl storages available locally */
    localProjections: LocalStorageProjection[],
  ) {
    this.grpcClient = grpcClientProviderFactory.createGrpcClientProvider((transport) => new DownloadClient(transport));
    this.remoteFileDownloader = new RemoteFileDownloader(httpClient);
    this.localStorageIdsToRoot = newLocalStorageIdsToRoot(localProjections);
  }

  close() {}

  /**
   * Gets a presign URL and downloads the file.
   * An optional range with 2 numbers from what byte and to what byte to download can be provided.
   * @param fromBytes - from byte including this byte
   * @param toBytes - to byte excluding this byte
   */
  async withBlobContent<T>(
    info: ResourceInfo,
    options: RpcOptions | undefined,
    ops: GetContentOptions,
    handler: ContentHandler<T>,
  ): Promise<T> {
    const { downloadUrl, headers } = await this.grpcGetDownloadUrl(info, options, ops.signal);

    const remoteHeaders = Object.fromEntries(headers.map(({ name, value }) => [name, value]));
    this.logger.info(`download blob ${stringifyWithResourceId(info)} from url ${downloadUrl}, ops: ${JSON.stringify(ops)}`);

    return isLocal(downloadUrl)
      ? await this.withLocalFileContent(downloadUrl, ops, handler)
      : await this.remoteFileDownloader.withContent(downloadUrl, remoteHeaders, ops, handler);
  }

  async withLocalFileContent<T>(
    url: string,
    ops: GetContentOptions,
    handler: ContentHandler<T>,
  ): Promise<T> {
    const { storageId, relativePath } = parseLocalUrl(url);
    const fullPath = getFullPath(storageId, this.localStorageIdsToRoot, relativePath);

    return await this.localFileReadLimiter.run(async () => {
      const readOps = {
        start: ops.range?.from,
        end: ops.range?.to !== undefined ? ops.range.to - 1 : undefined,
        signal: ops.signal,
      };
      let stream: fs.ReadStream | undefined;
      let handlerSuccess = false;

      try {
        const stat = await fsp.stat(fullPath);
        stream = fs.createReadStream(fullPath, readOps);
        const webStream = Readable.toWeb(stream);

        const result = await handler(webStream, stat.size);
        handlerSuccess = true;
        return result;
      } catch (error) {
        // Cleanup on error (including handler errors)
        if (!handlerSuccess && stream && !stream.destroyed) {
          stream.destroy();
        }
        throw error;
      }
    });
  }

  private async grpcGetDownloadUrl(
    { id, type }: ResourceInfo,
    options?: RpcOptions,
    signal?: AbortSignal,
  ): Promise<DownloadAPI_GetDownloadURL_Response> {
    const withAbort = options ?? {};
    withAbort.abort = signal;

    return await this.grpcClient.get().getDownloadURL(
      { resourceId: id, isInternalUse: false },
      addRTypeToMetadata(type, withAbort),
    ).response;
  }
}

export function parseLocalUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.pathname == '')
    throw new WrongLocalFileUrl(`url for local filepath ${url} does not match url scheme`);

  return {
    storageId: parsed.host,
    relativePath: decodeURIComponent(parsed.pathname.slice(1)),
  };
}

export function getFullPath(
  storageId: string,
  localStorageIdsToRoot: Map<string, string>,
  relativePath: string,
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
export class WrongLocalFileUrl extends Error {
  name = 'WrongLocalFileUrl';
}

/** Happens when a storage for a local file can't be found.  */
export class UnknownStorageError extends Error {
  name = 'UnknownStorageError';
}

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
