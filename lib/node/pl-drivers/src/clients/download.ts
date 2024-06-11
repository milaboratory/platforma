import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { DownloadClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/downloadapi/protocol.client';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import { MiLogger, notEmpty } from '@milaboratory/ts-helpers';
import { addRTypeToMetadata } from '@milaboratory/pl-client-v2';
import { Dispatcher, request } from 'undici';
import { DownloadAPI_GetDownloadURL_HTTPHeader, DownloadAPI_GetDownloadURL_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/downloadapi/protocol';
import { ResourceInfo } from "./helpers";

const storageProtocol = 'storage://';
const localPathRegex = /storage:\/\/(?<storageId>.*?)\/(?<localPath>.*)/;

export interface DownloadResponse {
  content: ReadableStream,
  size: number,
}

export class ClientDownload {
  public readonly grpcClient: DownloadClient;

  constructor(
    public readonly grpcTransport: GrpcTransport,
    public readonly httpClient: Dispatcher,
    public readonly logger: MiLogger,
    private readonly localStorageIdsToRoot: Record<string, string>,
  ) {
    this.grpcClient = new DownloadClient(this.grpcTransport);
  }

  close() {}

  async getUrl(
    { id, type }: ResourceInfo,
    options?: RpcOptions,
    signal?: AbortSignal,
  ): Promise<DownloadAPI_GetDownloadURL_Response> {
    const withAbort = options ?? {};
    withAbort.abort = signal;

    return await this.grpcClient.getDownloadURL(
      { resourceId: id }, addRTypeToMetadata(type, withAbort)
    ).response;
  }

  async downloadBlob(
    info: ResourceInfo,
    options?: RpcOptions,
    signal?: AbortSignal,
  ): Promise<DownloadResponse> {
    const { downloadUrl, headers } = await this.getUrl(info, options, signal);

    this.logger.info(`download from url ${downloadUrl}`);

    return this.isLocal(downloadUrl)
      ? await this.readLocalFile(downloadUrl)
      : await this.downloadRemoteFile(downloadUrl, headersFromProto(headers), signal);
  }

  private isLocal = (url: string) => url.startsWith(storageProtocol);

  async readLocalFile(url: string): Promise<DownloadResponse> {
    const parsed = url.match(localPathRegex);
    if (parsed === null || parsed.length != 3) {
      throw new Error(`url for local filepath ${url} does not match regex ${localPathRegex}, parsed: ${parsed}`);
    }

    const [_, storageId, localPath] = parsed;

    const storageRoot = notEmpty(
      this.localStorageIdsToRoot[storageId],
      `Unknown storage location: ${storageId}`,
    );

    const fullPath = path.join(storageRoot, localPath);
    const stat = await fsp.stat(fullPath);
    const size = stat.size;

    return {
      content: Readable.toWeb(fs.createReadStream(fullPath)),
      size,
    }
  }

  async downloadRemoteFile(
    url: string,
    reqHeaders: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<DownloadResponse> {
    const { statusCode, body, headers } = await request(url, {
      dispatcher: this.httpClient,
      headers: reqHeaders,
      signal,
    });

    if (400 <= statusCode && statusCode < 500) {
      throw new NetworkError400(`Http error: statusCode: ${statusCode} url: ${url.toString()}`)
    }
    if (statusCode != 200) {
      throw Error(
        `Http error: statusCode: ${statusCode} url: ${url.toString()}`,
      );
    }

    return {
      content: Readable.toWeb(body),
      size: Number(headers['content-length']),
    }
  }
}

function headersFromProto(
  headers: DownloadAPI_GetDownloadURL_HTTPHeader[],
): Record<string, string> {
  return Object.fromEntries(headers.map(({ name, value }) => [name, value]));
}

/** Throws when a status code of the downloading URL was in range [400, 500). */
export class NetworkError400 extends Error {}
