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
        lastModified: { seconds: BigInt(0), nanos: 0 },
        version: item.version,
      }));

      return {
        items,
        delimiter: resp.delimiter,
      };
    }
  }
}
