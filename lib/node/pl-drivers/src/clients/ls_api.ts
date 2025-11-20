import type { MiLogger } from '@milaboratories/ts-helpers';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import type { WireClientProvider, WireClientProviderFactory, WireConnection } from '@milaboratories/pl-client';
import { addRTypeToMetadata } from '@milaboratories/pl-client';
import type { LsAPI_List_Response } from '../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol';
import { LSClient } from '../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol.client';
import type { ResourceInfo } from '@milaboratories/pl-tree';

export class ClientLs {
  private readonly wire: WireClientProvider<LSClient>;

  constructor(
    wireClientProviderFactory: WireClientProviderFactory,
    private readonly logger: MiLogger,
  ) {
    this.wire = wireClientProviderFactory.createWireClientProvider(
      (wire: WireConnection) => {
        if (wire.type === 'grpc') {
          return new LSClient(wire.Transport);
        } else {
          // TODO: implement REST ls client.
          throw new Error('Unsupported transport type');
        }
      },
    );
  }

  close() {}

  public async list(
    rInfo: ResourceInfo,
    path: string,
    options?: RpcOptions,
  ): Promise<LsAPI_List_Response> {
    return await this.wire.get().list(
      {
        resourceId: rInfo.id,
        location: path,
      },
      addRTypeToMetadata(rInfo.type, options),
    ).response;
  }
}
