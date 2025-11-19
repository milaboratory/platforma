import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { notEmpty } from '@milaboratories/ts-helpers';
import type { Dispatcher } from 'undici';
import type { GrpcClientProvider, GrpcClientProviderFactory } from '@milaboratories/pl-client';
import { addRTypeToMetadata } from '@milaboratories/pl-client';
import type { StreamingAPI_Response } from '../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol';
import { StreamingClient } from '../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol.client';
import type { ResourceInfo } from '@milaboratories/pl-tree';

export class ClientLogs {
  public readonly grpcClient: GrpcClientProvider<StreamingClient>;

  constructor(
    grpcClientProviderFactory: GrpcClientProviderFactory,
    public readonly httpClient: Dispatcher,
    public readonly logger: MiLogger,
  ) {
    this.grpcClient = grpcClientProviderFactory.createGrpcClientProvider((transport) => new StreamingClient(transport));
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
    options?: RpcOptions,
  ): Promise<StreamingAPI_Response> {
    return (
      await this.grpcClient.get().lastLines(
        {
          resourceId: rId,
          lineCount: lineCount,
          offset: offsetBytes,
          search: searchStr,
        },
        addRTypeToMetadata(rType, options),
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
    options?: RpcOptions,
  ): Promise<StreamingAPI_Response> {
    return (
      await this.grpcClient.get().readText(
        {
          resourceId: notEmpty(rId),
          readLimit: BigInt(lineCount),
          offset: offsetBytes,
          search: searchStr,
        },
        addRTypeToMetadata(rType, options),
      )
    ).response;
  }
}
