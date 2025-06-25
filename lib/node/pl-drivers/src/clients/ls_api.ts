import type { MiLogger } from '@milaboratories/ts-helpers';
import type { LsAPI_List_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol';
import { LSClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol.client';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import type { GrpcClientProvider, GrpcClientProviderFactory } from '@milaboratories/pl-client';
import { addRTypeToMetadata } from '@milaboratories/pl-client';
import type { ResourceInfo } from '@milaboratories/pl-tree';

export class ClientLs {
  private readonly grpcClient: GrpcClientProvider<LSClient>;

  constructor(
    grpcClientProviderFactory: GrpcClientProviderFactory,
    private readonly logger: MiLogger,
  ) {
    this.grpcClient = grpcClientProviderFactory.createGrpcClientProvider((transport) => new LSClient(transport));
  }

  close() {}

  public async list(
    rInfo: ResourceInfo,
    path: string,
    options?: RpcOptions,
  ): Promise<LsAPI_List_Response> {
    return await this.grpcClient.get().list(
      {
        resourceId: rInfo.id,
        location: path,
      },
      addRTypeToMetadata(rInfo.type, options),
    ).response;
  }
}
