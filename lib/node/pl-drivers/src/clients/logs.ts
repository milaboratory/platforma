import { StreamingClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol.client';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { notEmpty } from '@milaboratories/ts-helpers';
import type { Dispatcher } from 'undici';
import type { WireClientProvider, WireClientProviderFactory } from '@milaboratories/pl-client';
import { addRTypeToMetadata } from '@milaboratories/pl-client';
import type { StreamingAPI_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol';
import type { ResourceInfo } from '@milaboratories/pl-tree';

export class ClientLogs {
  public readonly wire: WireClientProvider<StreamingClient>;

  constructor(
    wireClientProviderFactory: WireClientProviderFactory,
    public readonly httpClient: Dispatcher,
    public readonly logger: MiLogger,
  ) {
    this.wire = wireClientProviderFactory.createWireClientProvider((transport) => new StreamingClient(transport));
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
      await this.wire.get().lastLines(
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
      await this.wire.get().readText(
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
