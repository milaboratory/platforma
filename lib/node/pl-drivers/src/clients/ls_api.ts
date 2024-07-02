import { MiLogger } from '@milaboratory/ts-helpers';
import type { LsAPI_List_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol';
import { LSClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol.client';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import { addRTypeToMetadata } from '@milaboratory/pl-client-v2';
import { ResourceInfo } from '@milaboratory/pl-tree';

export class ClientLs {
  private readonly grpcClient: LSClient;

  constructor(
    grpcTransport: GrpcTransport,
    private readonly logger: MiLogger
  ) {
    this.grpcClient = new LSClient(grpcTransport);
  }

  close() {}

  public async list(
    rInfo: ResourceInfo,
    path: string,
    options?: RpcOptions
  ): Promise<LsAPI_List_Response> {
    return await this.grpcClient.list(
      {
        resourceId: rInfo.id,
        location: path
      },
      addRTypeToMetadata(rInfo.type, options)
    ).response;
  }
}
