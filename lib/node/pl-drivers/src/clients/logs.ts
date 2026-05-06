import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { notEmpty } from "@milaboratories/ts-helpers";
import type { Dispatcher } from "undici";
import type { WireClientProvider, WireClientProviderFactory } from "@milaboratories/pl-client";
import {
  addRTypeToMetadata,
  createRTypeRoutingHeader,
  RestAPI,
  parseSignedResourceId,
  signatureToBase64Url,
} from "@milaboratories/pl-client";
import type { StreamingAPI_Response } from "../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol";
import { StreamingClient } from "../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol.client";
import type { StreamingApiPaths, StreamingRestClientType } from "../proto-rest";
import type { ResourceInfo } from "@milaboratories/pl-tree";

export class ClientLogs {
  public readonly wire: WireClientProvider<StreamingRestClientType | StreamingClient>;

  constructor(
    wireClientProviderFactory: WireClientProviderFactory,
    public readonly httpClient: Dispatcher,
    public readonly logger: MiLogger,
  ) {
    this.wire = wireClientProviderFactory.createWireClientProvider((wire) => {
      if (wire.type === "grpc") {
        return new StreamingClient(wire.Transport);
      }

      return RestAPI.createClient<StreamingApiPaths>({
        hostAndPort: wire.Config.hostAndPort,
        ssl: wire.Config.ssl,
        dispatcher: wire.Dispatcher,
        middlewares: wire.Middlewares,
      });
    });
  }

  close() {}

  /** Reads text back and returns the text,
   * the new offset
   * and the total size of the (currently existing) file. */
  public async lastLines(
    { id: rId, type: rType }: ResourceInfo,
    lineCount: number,
    offsetBytes: bigint = 0n, // if 0n, then start from the end.
    searchStr?: string,
    options?: RpcOptions,
  ): Promise<StreamingAPI_Response> {
    const { globalId: rIdGlobal, signature: rIdSig } = parseSignedResourceId(rId);
    const client = this.wire.get();
    if (client instanceof StreamingClient) {
      return (
        await client.lastLines(
          {
            resourceId: rIdGlobal,
            resourceSignature: rIdSig,
            lineCount: lineCount,
            offset: offsetBytes,
            search: searchStr,
          },
          addRTypeToMetadata(rType, options),
        )
      ).response;
    }

    const resp = (
      await client.POST("/v1/last-lines", {
        body: {
          resourceId: rIdGlobal.toString(),
          resourceSignature: signatureToBase64Url(rIdSig),
          lineCount: lineCount,
          offset: offsetBytes.toString(),
          search: searchStr ?? "",
          searchRe: "",
        },
        headers: { ...createRTypeRoutingHeader(rType) },
      })
    ).data!;

    return {
      data: Buffer.from(resp.data, "base64"),
      size: BigInt(resp.size),
      newOffset: BigInt(resp.newOffset),
    };
  }

  /** Reads the file forward and returns the text,
   * the new offset
   * and the total size of the (currently existing) file. */
  public async readText(
    { id: rId, type: rType }: ResourceInfo,
    lineCount: number,
    offsetBytes: bigint = 0n, // if 0n, then start from the beginning.
    searchStr?: string,
    options?: RpcOptions,
  ): Promise<StreamingAPI_Response> {
    const { globalId: rIdGlobal2, signature: rIdSig2 } = parseSignedResourceId(rId);
    const client = this.wire.get();

    if (client instanceof StreamingClient) {
      return (
        await client.readText(
          {
            resourceId: notEmpty(rIdGlobal2),
            resourceSignature: rIdSig2,
            readLimit: BigInt(lineCount),
            offset: offsetBytes,
            search: searchStr,
          },
          addRTypeToMetadata(rType, options),
        )
      ).response;
    }

    const resp = (
      await client.POST("/v1/read/text", {
        body: {
          resourceId: rIdGlobal2.toString(),
          resourceSignature: signatureToBase64Url(rIdSig2),
          readLimit: lineCount.toString(),
          offset: offsetBytes.toString(),
          search: searchStr ?? "",
          searchRe: "",
        },
        headers: { ...createRTypeRoutingHeader(rType) },
      })
    ).data!;

    return {
      data: Buffer.from(resp.data, "base64"),
      size: BigInt(resp.size),
      newOffset: BigInt(resp.newOffset),
    };
  }
}
