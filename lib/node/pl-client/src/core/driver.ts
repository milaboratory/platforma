import type { PlClient } from './client';
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import type { Dispatcher } from 'undici';
import type { ResourceType } from './types';
import type { GrpcClientProviderFactory } from './grpc';

/** Drivers must implement this interface */
export interface PlDriver {
  close(): void;
}

/** Definition to use driver via {@link PlClient} */
export interface PlDriverDefinition<Drv extends PlDriver> {
  /** Used as key to only once instantiate specific drivers */
  readonly name: string;

  /** Initialization routine, will be executed only once for each driver in a specific client */
  init(pl: PlClient, grpcClientProviderFactory: GrpcClientProviderFactory, httpDispatcher: Dispatcher): Drv;
}

// addRTypeToMetadata adds a metadata with resource type
// for every RPC call. It is necessary for the platform core
// to proxy the call to the proper controller.
export function addRTypeToMetadata(rType: ResourceType, options?: RpcOptions) {
  options = options ?? {};
  options.meta = options.meta ?? {};
  options.meta['resourceType'] = `${rType.name}:${rType.version}`;

  return options;
}
