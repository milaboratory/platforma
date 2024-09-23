import { StreamingClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol.client';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import { MiLogger, notEmpty } from '@milaboratories/ts-helpers';
import { Dispatcher } from 'undici';
import { addRTypeToMetadata } from '@milaboratories/pl-client';
import { StreamingAPI_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol';
import { ResourceInfo } from '@milaboratories/pl-tree';

export class ClientLogs {
  public readonly grpcClient: StreamingClient;

  constructor(
    public readonly grpcTransport: GrpcTransport,
    public readonly httpClient: Dispatcher,
    public readonly logger: MiLogger
  ) {
    this.grpcClient = new StreamingClient(this.grpcTransport);
  }

  close() {}

  /** Reads text back and returns the text,
   * the new offset
   * and the total size of the (currently existing) file. */
  public async lastLines(
    { id: rId, type: rType }: ResourceInfo,
    lineCount: number,
    offsetBytes: bigint = 0n, // if 0n, then start from the end.
    searchStr?: string,
    options?: RpcOptions
  ): Promise<StreamingAPI_Response> {
    return (
      await this.grpcClient.lastLines(
        {
          resourceId: rId,
          lineCount: lineCount,
          offset: offsetBytes,
          search: searchStr
        },
        addRTypeToMetadata(rType, options)
      )
    ).response;
  }

  /** Reads the file forward and returns the text,
   * the new offset
   * and the total size of the (currently existing) file. */
  public async readText(
    { id: rId, type: rType }: ResourceInfo,
    lineCount: number,
    offsetBytes: bigint = 0n, // if 0n, then start from the beginning.
    searchStr?: string,
    options?: RpcOptions
  ): Promise<StreamingAPI_Response> {
    return (
      await this.grpcClient.readText(
        {
          resourceId: notEmpty(rId),
          readLimit: BigInt(lineCount),
          offset: offsetBytes,
          search: searchStr
        },
        addRTypeToMetadata(rType, options)
      )
    ).response;
  }
}
