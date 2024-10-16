import { Readable } from 'node:stream';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { DownloadClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/downloadapi/protocol.client';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import { MiLogger } from '@milaboratories/ts-helpers';
import { addRTypeToMetadata } from '@milaboratories/pl-client';
import { Dispatcher } from 'undici';
import {
  DownloadAPI_GetDownloadURL_HTTPHeader,
  DownloadAPI_GetDownloadURL_Response
} from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/downloadapi/protocol';
import { ResourceInfo } from '@milaboratories/pl-tree';
import { DownloadHelper, DownloadResponse } from '../helpers/download';
import { LocalStorageProjection } from '../drivers/types';
import { validateAbsolute } from '../helpers/validate';

const storageProtocol = 'storage://';
const localPathRegex = /storage:\/\/(?<storageId>.*?)\/(?<localPath>.*)/;

export class UnknownStorageError extends Error {}

export class WrongLocalFileUrl extends Error {}

/** Gets URLs for downloading from pl-core, parses them and reads or downloads
 * files locally and from the web. */
export class ClientDownload {
  public readonly grpcClient: DownloadClient;
  private readonly downloadHelper: DownloadHelper;
  private readonly localStorageIdsToRoot: Map<string, string>;

  constructor(
    public readonly grpcTransport: GrpcTransport,
    public readonly httpClient: Dispatcher,
    public readonly logger: MiLogger,
    /** Pl storages available locally */
    localProjections: LocalStorageProjection[]
  ) {
    for (const lp of localProjections) if (lp.localPath !== '') validateAbsolute(lp.localPath);
    this.grpcClient = new DownloadClient(this.grpcTransport);
    this.downloadHelper = new DownloadHelper(httpClient);
    this.localStorageIdsToRoot = new Map(
      localProjections.map((lp) => [lp.storageId, lp.localPath])
    );
  }

  close() {}

  async getUrl(
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

  async downloadBlob(
    info: ResourceInfo,
    options?: RpcOptions,
    signal?: AbortSignal
  ): Promise<DownloadResponse> {
    const { downloadUrl, headers } = await this.getUrl(info, options, signal);

    this.logger.info(`download from url ${downloadUrl}`);

    return this.isLocal(downloadUrl)
      ? await this.readLocalFile(downloadUrl)
      : await this.downloadHelper.downloadRemoteFile(
          downloadUrl,
          headersFromProto(headers),
          signal
        );
  }

  private isLocal = (url: string) => url.startsWith(storageProtocol);

  async readLocalFile(url: string): Promise<DownloadResponse> {
    const parsed = url.match(localPathRegex);
    if (parsed === null || parsed.length != 3) {
      throw new WrongLocalFileUrl(
        `url for local filepath ${url} does not match regex ${localPathRegex}, parsed: ${parsed}`
      );
    }

    const [_, storageId, localPath] = parsed;

    const storageRoot = this.localStorageIdsToRoot.get(storageId);
    if (storageRoot === undefined)
      throw new UnknownStorageError(`Unknown storage location: ${storageId}`);

    const fullPath = storageRoot === '' ? localPath : path.join(storageRoot, localPath);
    const stat = await fsp.stat(fullPath);
    const size = stat.size;

    return {
      content: Readable.toWeb(fs.createReadStream(fullPath)),
      size
    };
  }
}

export function headersFromProto(
  headers: DownloadAPI_GetDownloadURL_HTTPHeader[]
): Record<string, string> {
  return Object.fromEntries(headers.map(({ name, value }) => [name, value]));
}
