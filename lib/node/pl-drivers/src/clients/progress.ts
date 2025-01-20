import { ProgressClient } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/progressapi/protocol.client';
import type { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import { Duration } from '../proto/google/protobuf/duration';
import type { PlClient } from '@milaboratories/pl-client';
import { addRTypeToMetadata } from '@milaboratories/pl-client';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { notEmpty } from '@milaboratories/ts-helpers';
import type { Dispatcher } from 'undici';
import type { ResourceInfo } from '@milaboratories/pl-tree';

export type ProgressStatus = {
  done: boolean;
  progress: number;
  bytesProcessed?: string;
  bytesTotal?: string;
};

// ClientProgress holds a grpc connection to the platform
// but for Progress API service.
// When blobs are transfered, one can got a status of transfering
// using this API.
export class ClientProgress {
  public readonly grpcClient: ProgressClient;

  constructor(
    public readonly grpcTransport: GrpcTransport,
    _: Dispatcher,
    public readonly client: PlClient,
    public readonly logger: MiLogger,
  ) {
    this.grpcClient = new ProgressClient(this.grpcTransport);
  }

  close() {}

  /** getStatus gets a progress status by given rId and rType. */
  async getStatus({ id, type }: ResourceInfo, options?: RpcOptions): Promise<ProgressStatus> {
    const status = await this.grpcClient.getStatus(
      { resourceId: id },
      addRTypeToMetadata(type, options),
    );

    const report = notEmpty(status.response.report);

    return {
      done: report.done,
      progress: report.progress,
      bytesProcessed: String(report.bytesProcessed),
      bytesTotal: String(report.bytesTotal),
    };
  }

  // realtimeStatus returns a async generator that takes statuses from
  // GRPC stream every updateIntervalMs milliseconds.
  async *realtimeStatus(
    { id, type }: ResourceInfo,
    updateIntervalMs: number = 100,
    options?: RpcOptions,
  ) {
    options = addRTypeToMetadata(type, options);

    const secs = Math.floor(updateIntervalMs / 1000);
    const nanos = (updateIntervalMs - secs * 1000) * 1000000;
    const updateInterval = Duration.create({
      seconds: BigInt(secs),
      nanos: nanos,
    });

    try {
      const { responses } = this.grpcClient.realtimeStatus(
        {
          resourceId: id,
          updateInterval: updateInterval,
        },
        options,
      );

      yield * responses;
    } catch (e) {
      this.logger.warn('Failed to get realtime status' + e);
      throw e;
    }
  }
}
