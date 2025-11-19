import type { GrpcClientProvider, GrpcClientProviderFactory, PlClient, ResourceId, ResourceType } from '@milaboratories/pl-client';
import { addRTypeToMetadata } from '@milaboratories/pl-client';
import type { ResourceInfo } from '@milaboratories/pl-tree';
import type { MiLogger } from '@milaboratories/ts-helpers';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import * as fs from 'node:fs/promises';
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { UploadAPI_ChecksumAlgorithm, type UploadAPI_GetPartURL_Response } from '../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/uploadapi/protocol';
import { UploadClient } from '../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/uploadapi/protocol.client';
import { crc32c } from './crc32c';

import type { IncomingHttpHeaders } from 'undici/types/header';

export class MTimeError extends Error {
  name = 'MTimeError';
}

export class UnexpectedEOF extends Error {
  name = 'UnexpectedEOF';
}

export class NetworkError extends Error {
  name = 'NetworkError';
}

/** Happens when the file doesn't exist */
export class NoFileForUploading extends Error {
  name = 'NoFileForUploading';
}

export class BadRequestError extends Error {
  name = 'BadRequestError';
}

/** Low-level client for grpc uploadapi.
 * The user should pass here a concrete BlobUpload/<storageId> resource,
 * it can be got from handle field of BlobUpload. */
export class ClientUpload {
  private readonly grpcClient: GrpcClientProvider<UploadClient>;

  constructor(
    grpcClientProviderFactory: GrpcClientProviderFactory,
    public readonly httpClient: Dispatcher,
    _: PlClient,
    public readonly logger: MiLogger,
  ) {
    this.grpcClient = grpcClientProviderFactory.createGrpcClientProvider((transport) => new UploadClient(transport));
  }

  close() {}

  public async initUpload(
    { id, type }: ResourceInfo,
    options?: RpcOptions,
  ): Promise<{
      overall: bigint;
      toUpload: bigint[];
      checksumAlgorithm: UploadAPI_ChecksumAlgorithm;
      checksumHeader: string;
    }> {
    const init = await this.grpcInit(id, type, options);
    return {
      overall: init.partsCount,
      toUpload: this.partsToUpload(init.partsCount, init.uploadedParts),
      checksumAlgorithm: init.checksumAlgorithm,
      checksumHeader: init.checksumHeader,
    };
  }

  public async partUpload(
    { id, type }: ResourceInfo,
    path: string,
    expectedMTimeUnix: bigint,
    partNumber: bigint,
    checksumAlgorithm: UploadAPI_ChecksumAlgorithm,
    checksumHeader: string,
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

    const crc32cChecksum = calculateCrc32cChecksum(chunk);
    if (checksumAlgorithm === UploadAPI_ChecksumAlgorithm.CRC32C) {
      info.headers.push({ name: checksumHeader, value: crc32cChecksum });
    }

    const contentLength = Number(info.chunkEnd - info.chunkStart);
    if (chunk.length !== contentLength) {
      throw new Error(
        `Chunk size mismatch: expected ${contentLength} bytes, but read ${chunk.length} bytes from file`,
      );
    }

    const headers = Object.fromEntries(info.headers.map(({ name, value }) => [name.toLowerCase(), value]));

    try {
      const {
        body: rawBody,
        statusCode,
        headers: responseHeaders,
      } = await request(info.uploadUrl, {
        dispatcher: this.httpClient,
        body: chunk,
        // We got headers only after we send
        // the whole body (in case of S3 PUT requests it's 5 MB).
        // It might be slow with a slow connection (or with SSH),
        // that's why we got big timeout here.
        headersTimeout: 60000,
        bodyTimeout: 60000,
        // Prevent connection reuse by setting "Connection: close" header.
        // This works around an issue with the backend's built-in S3 implementation
        // that caused HTTP/1.1 protocol lines to be included in the uploaded file content.
        reset: true,
        headers,
        method: info.method.toUpperCase() as Dispatcher.HttpMethod,
      });

      // always read the body for resources to be garbage collected.
      const body = await rawBody.text();
      checkStatusCodeOk(statusCode, body, responseHeaders, info);
    } catch (e: unknown) {
      if (e instanceof NetworkError)
        throw e;

      if (e instanceof BadRequestError)
        throw e;

      throw new Error(`partUpload: error ${JSON.stringify(e)} happened while trying to do part upload to the url ${info.uploadUrl}, headers: ${JSON.stringify(info.headers)}`);
    }

    await this.grpcUpdateProgress({ id, type }, BigInt(info.chunkEnd - info.chunkStart), options);
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
    return await this.grpcClient.get().init({ resourceId: id }, addRTypeToMetadata(type, options))
      .response;
  }

  private async grpcGetPartUrl(
    { id, type }: ResourceInfo,
    partNumber: bigint,
    uploadedPartSize: bigint,
    options?: RpcOptions,
  ) {
    // partChecksum isn't used for now but protoc requires it to be set
    return await this.grpcClient.get().getPartURL(
      { resourceId: id, partNumber, uploadedPartSize, isInternalUse: false, partChecksum: '' },
      addRTypeToMetadata(type, options),
    ).response;
  }

  private async grpcUpdateProgress(
    { id, type }: ResourceInfo,
    bytesProcessed: bigint,
    options?: RpcOptions,
  ) {
    await this.grpcClient.get().updateProgress(
      {
        resourceId: id,
        bytesProcessed,
      },
      addRTypeToMetadata(type, options),
    ).response;
  }

  private async grpcFinalize({ id, type }: ResourceInfo, options?: RpcOptions) {
    return await this.grpcClient.get().finalize({ resourceId: id }, addRTypeToMetadata(type, options))
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
  info: UploadAPI_GetPartURL_Response,
) {
  if (statusCode == 400) {
    throw new BadRequestError(`response is not ok, status code: ${statusCode},`
      + ` body: ${body}, headers: ${JSON.stringify(headers)}, url: ${info.uploadUrl}`);
  }

  if (statusCode != 200) {
    throw new NetworkError(
      `response is not ok, status code: ${statusCode},`
      + ` body: ${body}, headers: ${JSON.stringify(headers)}, url: ${info.uploadUrl}`,
    );
  }
}

/** Calculate CRC32C checksum of a buffer and return as base64 string */
function calculateCrc32cChecksum(data: Buffer): string {
  const checksum = crc32c(data);
  // Convert to unsigned 32-bit integer and then to base64
  const buffer = Buffer.alloc(4);

  buffer.writeUInt32BE(checksum, 0);
  return buffer.toString('base64');
}
