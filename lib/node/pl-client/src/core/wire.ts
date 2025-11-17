import type { GrpcTransport } from '@protobuf-ts/grpc-transport';

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
  createWireClientProvider<Client>(clientConstructor: (transport: GrpcTransport) => Client): WireClientProvider<Client>;
}
