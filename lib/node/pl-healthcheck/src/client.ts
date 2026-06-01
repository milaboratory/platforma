import type { ClientOptions } from "@grpc/grpc-js";
import { ChannelCredentials } from "@grpc/grpc-js";
import type { GrpcOptions } from "@protobuf-ts/grpc-transport";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { HealthClient } from "./proto-grpc/grpc/health/v1/health.client";
import { HealthCheckResponse_ServingStatus } from "./proto-grpc/grpc/health/v1/health";

export type ServingStatus = HealthCheckResponse_ServingStatus;
export const ServingStatus = HealthCheckResponse_ServingStatus;

export type PlHealthClientOptions = {
  /** "host:port" — e.g. "127.0.0.1:6345" */
  address: string;
  /** Per-RPC timeout in ms. Default: 1000. */
  defaultRequestTimeout?: number;
  /** Use TLS. Default: false. */
  ssl?: boolean;
  /** Service name to check. Default: "" (overall server health). */
  service?: string;
};

const DEFAULT_TIMEOUT_MS = 1000;

/** Single Check RPC. Builds a transient client, performs the check, and tears it down. */
export async function plHealthCheck(opts: PlHealthClientOptions): Promise<ServingStatus> {
  const timeout = opts.defaultRequestTimeout ?? DEFAULT_TIMEOUT_MS;
  const grpcOpts: GrpcOptions = {
    host: opts.address,
    timeout,
    channelCredentials: opts.ssl
      ? ChannelCredentials.createSsl()
      : ChannelCredentials.createInsecure(),
    clientOptions: {
      "grpc.service_config_disable_resolution": 1,
    } satisfies ClientOptions,
  };
  const transport = new GrpcTransport(grpcOpts);
  try {
    const client = new HealthClient(transport);
    const { response } = await client.check({ service: opts.service ?? "" }, { timeout });
    return response.status;
  } finally {
    transport.close();
  }
}
