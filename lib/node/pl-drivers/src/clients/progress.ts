import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
import type {
  WireClientProvider,
  WireClientProviderFactory,
  PlClient,
} from "@milaboratories/pl-client";
import { addRTypeToMetadata, createRTypeRoutingHeader, RestAPI } from "@milaboratories/pl-client";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { notEmpty } from "@milaboratories/ts-helpers";
import type { Dispatcher } from "undici";
import { ProgressClient } from "../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/progressapi/protocol.client";
import type { ProgressAPI_Report } from "../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/progressapi/protocol";
import type { ProgressApiPaths, ProgressRestClientType } from "../proto-rest";
import type { ResourceInfo } from "@milaboratories/pl-tree";

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
  public readonly wire: WireClientProvider<ProgressRestClientType | ProgressClient>;

  constructor(
    wireClientProviderFactory: WireClientProviderFactory,
    _: Dispatcher,
    public readonly client: PlClient,
    public readonly logger: MiLogger,
  ) {
    this.wire = wireClientProviderFactory.createWireClientProvider((wire) => {
      if (wire.type === "grpc") {
        return new ProgressClient(wire.Transport);
      }

      return RestAPI.createClient<ProgressApiPaths>({
        hostAndPort: wire.Config.hostAndPort,
        ssl: wire.Config.ssl,
        dispatcher: wire.Dispatcher,
        middlewares: wire.Middlewares,
      });
    });
  }

  close() {}

  /** getStatus gets a progress status by given rId and rType. */
  async getStatus({ id, type }: ResourceInfo, options?: RpcOptions): Promise<ProgressStatus> {
    const client = this.wire.get();

    let report: ProgressAPI_Report;
    if (client instanceof ProgressClient) {
      report = notEmpty(
        (await client.getStatus({ resourceId: id }, addRTypeToMetadata(type, options)).response)
          .report,
      );
    } else {
      const resp = (
        await client.POST("/v1/get-progress", {
          body: { resourceId: id.toString() },
          headers: { ...createRTypeRoutingHeader(type) },
        })
      ).data!.report;
      report = {
        done: resp.done,
        progress: resp.progress,
        bytesProcessed: BigInt(resp.bytesProcessed),
        bytesTotal: BigInt(resp.bytesTotal),
        name: resp.name,
      };
    }

    return {
      done: report.done,
      progress: report.progress,
      bytesProcessed: String(report.bytesProcessed),
      bytesTotal: String(report.bytesTotal),
    };
  }
}
