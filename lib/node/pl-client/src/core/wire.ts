import type { GrpcTransport } from "@protobuf-ts/grpc-transport";
import type { Dispatcher } from "undici";
import type { PlClientConfig, wireProtocol } from "./config";
import type { Middleware } from "openapi-fetch";

/**
 * Options for the HTTP client to properly reach the PL server API when
 * it works in WebSocket + REST mode.
 */
export type RestConnection = {
  type: "rest";
  Config: PlClientConfig;
  Dispatcher: Dispatcher;
  Middlewares: Middleware[];
};

export type GrpcConnection = {
  type: "grpc";
  Transport: GrpcTransport;
};

export type WireConnection = RestConnection | GrpcConnection;
// type compatibility check: types used in WireConnection should match known wire protocols.
const _ct: Extract<WireConnection, { type: string }>["type"] = "rest" as wireProtocol;

/**
 * A provider for a wire (gRPC, HTTP, etc.) client.
 * The client is created on demand, and is reset when the transport is reset.
 * This is useful for cases where the client is used in a loop, and the transport is reset after each iteration.
 */
export interface WireClientProvider<Client> {
  get(): Client;
}

/**
 * A factory for wire client providers.
 */
export interface WireClientProviderFactory {
  createWireClientProvider<Client>(
    clientConstructor: (transport: WireConnection) => Client,
  ): WireClientProvider<Client>;
}
