import * as fs from 'node:fs/promises';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import { PlClient, addRTypeToMetadata } from '@milaboratory/pl-client-v2';
import { UploadClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/uploadapi/protocol.client';
import { MiLogger } from '@milaboratory/ts-helpers';
import { Dispatcher, request } from 'undici';
import { uploadapi_GetPartURL_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/uploadapi/protocol';
import { ResourceInfo } from './helpers';

export class MTimeError extends Error {}

export class UnexpectedEOF extends Error {}

export class NetworkError extends Error {}

/** Low-level client for grpc uploadapi.
 * The user should pass here a concrete BlobUpload/<storageId> resource,
 * it can be got from handle field of BlobUpload. */
export class ClientBlob {
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
  ): Promise<bigint[]> {
    const init = await this.grpcClient.init(
      { resourceId: id },
      addRTypeToMetadata(type, options)
    )
    return this.partsToUpload(init.response);
  }

  public async partUpload(
    { id, type }: ResourceInfo,
    path: string,
    partNumber: bigint,
    expectedMTimeUnix: bigint,
    options?: RpcOptions,
  ) {
    const info = await this.grpcClient.getPartURL({
      resourceId: id,
      partNumber: partNumber,
      uploadedPartSize: 0n, // we update progress as a separate call later.
    }, addRTypeToMetadata(type, options)).response;

    const { chunk, mTime } = await this.readChunk(
      path, info.chunkStart, info.chunkEnd,
    );
    if (mTime > expectedMTimeUnix) {
      throw new MTimeError(
        'file was modified, expected mtime: ' + expectedMTimeUnix +
          ', got: ' + mTime + '.',
      )
    }

    const { statusCode } = await request(
      info.uploadUrl,
      this.prepareUploadOpts(info, chunk),
    );

    if (statusCode != 200) {
      throw new NetworkError('response is not ok, status code: ' + statusCode);
    }

    this.logger.info('uploaded chunk ' + partNumber + ' of resource: ' + id);

    await this.grpcClient.updateProgress({
      resourceId: id,
      bytesProcessed: info.chunkEnd - info.chunkStart,
    }, addRTypeToMetadata(type, options))
  }

  public async finalizeUpload({ id, type }: ResourceInfo, options?: RpcOptions) {
    return await this.grpcClient.finalize(
      { resourceId: id },
      addRTypeToMetadata(type, options),
    )
  }

  private async readChunk(
    path: string,
    chunkStart: bigint, chunkEnd: bigint,
  ): Promise<{ chunk: Buffer, mTime: bigint }> {
    let f: fs.FileHandle | undefined;
    try {
      f = await fs.open(path);
      const len = Number(chunkEnd - chunkStart);
      const pos = Number(chunkStart);
      const b = Buffer.alloc(len);
      const bytesRead = await this.readBytesFromPosition(f, b, len, pos);

      const stat = await fs.stat(path);

      return {
        chunk: b.subarray(0, bytesRead),
        mTime: BigInt(Math.floor(stat.mtime.getTime() / 1000)),
      };
    } finally {
      f?.close()
    }
  }

  /** Read len bytes from a given position. The reason the method exists
      is that FileHandle.read can read less bytes than it's needed. */
  async readBytesFromPosition(f: fs.FileHandle, b: Buffer, len: number, position: number) {
    let bytesReadTotal = 0;
    while (bytesReadTotal < len) {
      const { bytesRead } = await f.read(
        b,
        bytesReadTotal,
        len - bytesReadTotal,
        position + bytesReadTotal,
      );
      if (bytesRead === 0) {
        throw new UnexpectedEOF('file ended earlier than expected.')
      }
      bytesReadTotal += bytesRead;
    }

    return bytesReadTotal;
  }

  /** Calculates parts that need to be uploaded from the parts that were
   * already uploaded. */
  private partsToUpload(info: {
    partsCount: bigint,
    uploadedParts: bigint[],
  }): bigint[] {
    const toUpload: bigint[] = [];
    const uploaded = new Set(info.uploadedParts);

    for (let i = 1n; i <= info.partsCount; i++) {
      if (!uploaded.has(i))
        toUpload.push(i);
    }

    return toUpload
  }

  private prepareUploadOpts(
    info: uploadapi_GetPartURL_Response,
    chunk: Buffer,
  ): any {
    const headers = info.headers.map(({ name, value }) => [name, value])

    return {
      dispatcher: this.httpClient,
      body: chunk,
      headers: Object.fromEntries(headers),
      method: info.method.toUpperCase() as Dispatcher.HttpMethod,
    }
  }
}
