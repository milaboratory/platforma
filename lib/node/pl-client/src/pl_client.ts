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

  // public async transaction<R>(writable: boolean,
  //                             txName: string,
  //                             cb: (t: PlTransaction) => Promise<R>): Promise<R> {
  //   const stream = this.grpcClient.tx();
  //   const tx = new PlTransaction(stream, writable, txName);
  //
  //
  //   // let tx: PlTransaction;
  //   // return tryExecute(async () => {
  //   //   txName = txName ?? uniqueId();
  //   //   tx = new Transaction(this, txName, writable);
  //   //   const res = await cb(tx);
  //   //   await tx.commitAndMaybeSync();
  //   //   this.logger.debug(tx.getReport());
  //   //   return res;
  //   // }, async (e: unknown) => {
  //   //   if (e instanceof FailedToCommitError) {
  //   //     this.logger.warn('Failed to commit: ' + tx.name);
  //   //     return true;
  //   //   }
  //   //
  //   //   if (isRpcError(e)) {
  //   //     this.logger.warn('tx RpcError error', e);
  //   //     throw e;
  //   //   }
  //   //
  //   //   if (e instanceof StatusError) {
  //   //     this.logger.debug('status error', e);
  //   //   } else {
  //   //     this.logger.warn('tx unknown error', e);
  //   //   }
  //   //
  //   //   try {
  //   //     await promiseTimeout(tx.discard(), 1000); // @todo
  //   //   } catch (err) {
  //   //     this.logger.warn('Cannot discard tx', err);
  //   //   }
  //   //
  //   //   throw e;
  //   // });
  // }
}
