import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { notEmpty } from '@milaboratories/ts-helpers';
import type { Dispatcher } from 'undici';
import type { WireClientProvider, WireClientProviderFactory } from '@milaboratories/pl-client';
import { addRTypeToMetadata, createRTypeRoutingHeader, RestAPI } from '@milaboratories/pl-client';
import type { StreamingAPI_Response } from '../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol';
import { StreamingClient } from '../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol.client';
import type { StreamingApiPaths, StreamingRestClientType } from '../proto-rest';
import type { ResourceInfo } from '@milaboratories/pl-tree';

export class ClientLogs {
  public readonly wire: WireClientProvider<StreamingRestClientType | StreamingClient>;

  constructor(
    wireClientProviderFactory: WireClientProviderFactory,
    public readonly httpClient: Dispatcher,
    public readonly logger: MiLogger,
  ) {
    this.wire = wireClientProviderFactory.createWireClientProvider(
      (wire) => {
        if (wire.type === 'grpc') {
          return new StreamingClient(wire.Transport);
        }

        return RestAPI.createClient<StreamingApiPaths>({
          hostAndPort: wire.Config.hostAndPort,
          ssl: wire.Config.ssl,
          dispatcher: wire.Dispatcher,
          middlewares: wire.Middlewares,
        });
      });
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
    const client = this.wire.get();
    if (client instanceof StreamingClient) {
      return (
        await client.lastLines(
          { resourceId: rId, lineCount: lineCount, offset: offsetBytes, search: searchStr },
          addRTypeToMetadata(rType, options),
        )
      ).response;
    }

    const resp = (await client.POST('/v1/last-lines', {
      body: {
        resourceId: rId.toString(),
        lineCount: lineCount,
        offset: offsetBytes.toString(),
        search: searchStr ?? '',
        searchRe: '',
      },
      headers: { ...createRTypeRoutingHeader(rType) },
    })).data!;

    return {
      data: new Uint8Array(Buffer.from(resp.data)),
      size: BigInt(resp.size),
      newOffset: BigInt(resp.newOffset),
    };
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
    const client = this.wire.get();

    if (client instanceof StreamingClient) {
      return (await client.readText(
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

    const resp = (await client.POST('/v1/read/text', {
      body: {
        resourceId: rId.toString(),
        readLimit: lineCount.toString(),
        offset: offsetBytes.toString(),
        search: searchStr ?? '',
        searchRe: '',
      },
    })).data!;

    return {
      data: new Uint8Array(Buffer.from(resp.data)),
      size: BigInt(resp.size),
      newOffset: BigInt(resp.newOffset),
    };
  }
}
