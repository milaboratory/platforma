import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { MaintenanceAPI_Ping_Response } from './proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { IPlatformClient, PlatformClient } from './proto/github.com/milaboratory/pl/plapi/plapiproto/api.client';

export type PlPingResponse = MaintenanceAPI_Ping_Response;

/** Client for core pl API. Wraps grpc API into more ts idiomatic methods and
 * classes, implements easy to use wrapper around tx API. */
export class PlClient {
  private readonly grpcClient: IPlatformClient;

  constructor(transport: GrpcTransport) {
    this.grpcClient = new PlatformClient(transport);
  }

  /** @param timeout timeout in milliseconds */
  async ping(timeout?: number): Promise<PlPingResponse> {
    const response = await this.grpcClient.ping({}, { timeout });
    return response.response;
  }
}
