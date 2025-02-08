import type { PlClient, ResourceId, ResourceType } from '@milaboratories/pl-client';
import { addRTypeToMetadata } from '@milaboratories/pl-client';
import type { ResourceInfo } from '@milaboratories/pl-tree';
import type { MiLogger } from '@milaboratories/ts-helpers';
import type { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import * as fs from 'node:fs/promises';
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import type { uploadapi_GetPartURL_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/uploadapi/protocol';
import { UploadClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/uploadapi/protocol.client';
import { toHeadersMap } from './helpers';
import type { IncomingHttpHeaders } from 'undici/types/header';

export class MTimeError extends Error {}

export class UnexpectedEOF extends Error {}

export class NetworkError extends Error {}

/** Happens when the file doesn't exist */
export class NoFileForUploading extends Error {}

/** Low-level client for grpc uploadapi.
 * The user should pass here a concrete BlobUpload/<storageId> resource,
 * it can be got from handle field of BlobUpload. */
export class ClientUpload {
  private readonly grpcClient: UploadClient;

  constructor(
    public readonly grpcTransport: GrpcTransport,
    public readonly httpClient: Dispatcher,
    _: PlClient,
    public readonly logger: MiLogger,
  ) {
    this.grpcClient = new UploadClient(this.grpcTransport);
  }

  close() {}

  public async initUpload(
    { id, type }: ResourceInfo,
    options?: RpcOptions,
  ): Promise<{
      overall: bigint;
      toUpload: bigint[];
    }> {
    const init = await this.grpcInit(id, type, options);
    return {
      overall: init.partsCount,
      toUpload: this.partsToUpload(init.partsCount, init.uploadedParts),
    };
  }

  public async partUpload(
    { id, type }: ResourceInfo,
    path: string,
    expectedMTimeUnix: bigint,
    partNumber: bigint,
    options?: RpcOptions,
  ) {
    const info = await this.grpcGetPartUrl(
      { id, type },
      partNumber,
      0n, // we update progress as a separate call later.
      options,
    );

    const chunk = await readFileChunk(path, info.chunkStart, info.chunkEnd);
    await checkExpectedMTime(path, expectedMTimeUnix);

    try {
      const {
        body: rawBody,
        statusCode,
        headers,
      } = await request(info.uploadUrl, {
        dispatcher: this.httpClient,
        body: chunk,
        headers: toHeadersMap(info.headers),
        method: info.method.toUpperCase() as Dispatcher.HttpMethod,
      });

      // always read the body for resources to be garbage collected.
      const body = await rawBody.text();
      checkStatusCodeOk(statusCode, body, headers, info);
    } catch (e: unknown) {
      throw new Error(`partUpload: error ${JSON.stringify(e)} happened while trying to do part upload to the url ${info.uploadUrl}, headers: ${JSON.stringify(info.headers)}`);
    }

    await this.grpcUpdateProgress({ id, type }, info.chunkEnd - info.chunkStart, options);
  }

  public async finalize(info: ResourceInfo, options?: RpcOptions) {
    return await this.grpcFinalize(info, options);
  }

  /** Calculates parts that need to be uploaded from the parts that were
   * already uploaded. */
  private partsToUpload(partsCount: bigint, uploadedParts: bigint[]): bigint[] {
    const toUpload: bigint[] = [];
    const uploaded = new Set(uploadedParts);

    for (let i = 1n; i <= partsCount; i++) {
      if (!uploaded.has(i)) toUpload.push(i);
    }

    return toUpload;
  }

  private async grpcInit(id: ResourceId, type: ResourceType, options?: RpcOptions) {
    return await this.grpcClient.init({ resourceId: id }, addRTypeToMetadata(type, options))
      .response;
  }

  private async grpcGetPartUrl(
    { id, type }: ResourceInfo,
    partNumber: bigint,
    uploadedPartSize: bigint,
    options?: RpcOptions,
  ) {
    return await this.grpcClient.getPartURL(
      { resourceId: id, partNumber, uploadedPartSize },
      addRTypeToMetadata(type, options),
    ).response;
  }

  private async grpcUpdateProgress(
    { id, type }: ResourceInfo,
    bytesProcessed: bigint,
    options?: RpcOptions,
  ) {
    await this.grpcClient.updateProgress(
      {
        resourceId: id,
        bytesProcessed,
      },
      addRTypeToMetadata(type, options),
    ).response;
  }

  private async grpcFinalize({ id, type }: ResourceInfo, options?: RpcOptions) {
    return await this.grpcClient.finalize({ resourceId: id }, addRTypeToMetadata(type, options))
      .response;
  }
}

async function readFileChunk(path: string, chunkStart: bigint, chunkEnd: bigint): Promise<Buffer> {
  let f: fs.FileHandle | undefined;
  try {
    f = await fs.open(path);
    const len = Number(chunkEnd - chunkStart);
    const pos = Number(chunkStart);
    const b = Buffer.alloc(len);
    const bytesRead = await readBytesFromPosition(f, b, len, pos);

    return b.subarray(0, bytesRead);
  } catch (e: unknown) {
    if (e && typeof e === 'object' && ('code' in e) && e.code == 'ENOENT') throw new NoFileForUploading(`there is no file ${path} for uploading`);
    throw e;
  } finally {
    await f?.close();
  }
}

/** Read len bytes from a given position.
 * Without this, `FileHandle.read` can read less bytes than needed. */
async function readBytesFromPosition(f: fs.FileHandle, b: Buffer, len: number, position: number) {
  let bytesReadTotal = 0;
  while (bytesReadTotal < len) {
    const { bytesRead } = await f.read(
      b,
      bytesReadTotal,
      len - bytesReadTotal,
      position + bytesReadTotal,
    );
    if (bytesRead === 0) {
      throw new UnexpectedEOF('file ended earlier than expected.');
    }
    bytesReadTotal += bytesRead;
  }

  return bytesReadTotal;
}

async function checkExpectedMTime(path: string, expectedMTimeUnix: bigint) {
  const mTime = BigInt(Math.floor((await fs.stat(path)).mtimeMs / 1000));
  if (mTime > expectedMTimeUnix) {
    throw new MTimeError(`file was modified, expected mtime: ${expectedMTimeUnix}, got: ${mTime}.`);
  }
}

function checkStatusCodeOk(
  statusCode: number,
  body: string,
  headers: IncomingHttpHeaders,
  info: uploadapi_GetPartURL_Response,
) {
  if (statusCode != 200) {
    throw new NetworkError(
      `response is not ok, status code: ${statusCode},`
      + ` body: ${body}, headers: ${JSON.stringify(headers)}, url: ${info.uploadUrl}`,
    );
  }
}
