import type { MiLogger } from '@milaboratories/ts-helpers';
import type { LsAPI_List_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol';
import { LSClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol.client';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import type { WireClientProvider, WireClientProviderFactory } from '@milaboratories/pl-client';
import { addRTypeToMetadata } from '@milaboratories/pl-client';
import type { ResourceInfo } from '@milaboratories/pl-tree';

export class ClientLs {
  private readonly wire: WireClientProvider<LSClient>;

  constructor(
    wireClientProviderFactory: WireClientProviderFactory,
    private readonly logger: MiLogger,
  ) {
    this.wire = wireClientProviderFactory.createWireClientProvider((transport) => new LSClient(transport));
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
