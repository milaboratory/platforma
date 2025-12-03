import type { MiLogger } from '@milaboratories/ts-helpers';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import type { WireClientProvider, WireClientProviderFactory } from '@milaboratories/pl-client';
import { RestAPI } from '@milaboratories/pl-client';
import { addRTypeToMetadata, createRTypeRoutingHeader } from '@milaboratories/pl-client';
import type { LsAPI_List_Response, LsAPI_ListItem } from '../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol';
import { LSClient } from '../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol.client';
import type { LsApiPaths, LsRestClientType } from '../proto-rest';

import type { ResourceInfo } from '@milaboratories/pl-tree';

export class ClientLs {
  private readonly wire: WireClientProvider<LsRestClientType | LSClient>;

  constructor(
    wireClientProviderFactory: WireClientProviderFactory,
    private readonly logger: MiLogger,
  ) {
    this.wire = wireClientProviderFactory.createWireClientProvider(
      (wire) => {
        if (wire.type === 'grpc') {
          return new LSClient(wire.Transport);
        }

        return RestAPI.createClient<LsApiPaths>({
          hostAndPort: wire.Config.hostAndPort,
          ssl: wire.Config.ssl,
          dispatcher: wire.Dispatcher,
          middlewares: wire.Middlewares,
        });
      },
    );
  }

  close() {}

  public async list(
    rInfo: ResourceInfo,
    path: string,
    options?: RpcOptions,
  ): Promise<LsAPI_List_Response> {
    const client = this.wire.get();

    if (client instanceof LSClient) {
      return await client.list(
        {
          resourceId: rInfo.id,
          location: path,
        },
        addRTypeToMetadata(rInfo.type, options),
      ).response;
    } else {
      const resp = (await client.POST('/v1/list', {
        body: {
          resourceId: rInfo.id.toString(),
          location: path,
        },
        headers: { ...createRTypeRoutingHeader(rInfo.type) },
      })).data!;

      const items: LsAPI_ListItem[] = resp.items.map((item) => ({
        name: item.name,
        size: BigInt(item.size),
        isDir: item.isDir,
        fullName: item.fullName,
        directory: item.directory,
        lastModified: parseTimestamp(item.lastModified),
        version: item.version,
      }));

      return {
        items,
        delimiter: resp.delimiter,
      };
    }
  }
}

function parseTimestamp(timestamp: string): { seconds: bigint; nanos: number } {
  // Parse ISO 8601 format: 2025-08-08T11:12:44.145635532Z
  const date = new Date(timestamp);
  const seconds = BigInt(Math.floor(date.getTime() / 1000));

  // Extract fractional seconds from the original string
  const fractionalMatch = timestamp.match(/\.(\d+)Z?$/);
  let nanos = 0;
  if (fractionalMatch) {
    const fractionalPart = fractionalMatch[1];
    // Pad or truncate to 9 digits (nanoseconds)
    const padded = fractionalPart.padEnd(9, '0').slice(0, 9);
    nanos = parseInt(padded, 10);
  }

  return { seconds, nanos };
}
