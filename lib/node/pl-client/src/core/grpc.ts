import type { GrpcTransport } from '@protobuf-ts/grpc-transport';

/**
 * A provider for a grpc client.
 * The client is created on demand, and is reset when the transport is reset.
 * This is useful for cases where the client is used in a loop, and the transport is reset after each iteration.
 */
export interface GrpcClientProvider<Client> {
  get(): Client;
}

/**
 * A factory for grpc client providers.
 */
export interface GrpcClientProviderFactory {
  createGrpcClientProvider<Client>(clientConstructor: (transport: GrpcTransport) => Client): GrpcClientProvider<Client>;
}
