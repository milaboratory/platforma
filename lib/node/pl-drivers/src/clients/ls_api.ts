import { MiLogger, notEmpty } from '@milaboratory/ts-helpers';
import type { LsAPI_List_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol';
import { LSClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol.client';
import type { GrpcOptions } from '@protobuf-ts/grpc-transport';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import { Dispatcher } from 'undici';
import { PlClient, addRTypeToMetadata } from '@milaboratory/pl-client-v2';

export class ClientLsFiles {
  private storageIdToResourceId: Record<string, bigint> = {};
  public readonly grpcClient: LSClient;

  constructor(
    public readonly grpcTransport: GrpcTransport,
    public readonly httpClient: Dispatcher,
    private readonly client: PlClient,
    public readonly logger: MiLogger,

    public readonly grpcOptions: GrpcOptions
  ) {
    this.grpcClient = new LSClient(grpcTransport);
  }

  close() {}

  public async list(
    storageId: string,
    path: string,
    options?: RpcOptions
  ): Promise<LsAPI_List_Response> {
    const rType = { name: `LS/${storageId}`, version: '1' };

    return await this.grpcClient.list(
      {
        resourceId: await this.getStorageResourceId(storageId),
        location: path
      },
      addRTypeToMetadata(rType, options)
    ).response;
  }

  // @TODO clean cache by time
  public async getAndSetAvailableStorageIds(
    reload: boolean = false
  ): Promise<Record<string, bigint>> {
    if (reload) {
      this.storageIdToResourceId = {};
    }

    if (!Object.keys(this.storageIdToResourceId).length) {
      this.client.withReadTx('GetAvailableStorageIds', async (tx) => {
        const lsProviderId = await tx.getResourceByName('LSProvider');
        const provider = await tx.getResourceData(lsProviderId, true);

        provider.fields.forEach((f) => {
          if (f.type != 'Dynamic' || f.value == 0n) return;
          const storageName = f.name.substring('storage/'.length);
          this.storageIdToResourceId[storageName] = f.value;
        });
      });
    }

    return this.storageIdToResourceId;
  }

  public async getStorageResourceId(storageId: string): Promise<bigint> {
    await this.getAndSetAvailableStorageIds();
    return notEmpty(
      this.storageIdToResourceId[storageId],
      `ResourceId not found for storageId ${storageId}`
    );
  }
}
