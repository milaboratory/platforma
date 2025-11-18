import type { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { Dispatcher } from 'undici';
import type { PlClientConfig } from './config';

/**
 * Options for the HTTP client to properly reach the PL server API when
 * it works in WebSocket + REST mode.
 */
export type HttpConnection = {
  type: 'rest';
  Config: PlClientConfig;
  Dispatcher: Dispatcher;
};

export type GrpcConnection = {
  type: 'grpc';
  Transport: GrpcTransport;
};

export type WireConnection = HttpConnection | GrpcConnection;
export type wireType = Extract<WireConnection, { type: string }>['type'];

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
  createWireClientProvider<RestClient, GrpcClient>(clientConstructor: (transport: WireConnection) => RestClient | GrpcClient): WireClientProvider<RestClient | GrpcClient>;
}
