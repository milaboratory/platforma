import { LLPlClient } from './ll_client';
import { PlClient } from './client';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { Dispatcher } from 'undici';

/** Drivers must implement this interface */
export interface PlDriver {
  close(): void;
}

/** Definition to use driver via {@link PlClient} */
export interface PlDriverDefinition<Drv extends PlDriver> {
  /** Used as key to only once instantiate specific drivers */
  readonly name: string;

  /** Initialization routine, will be executed only once for each driver in a specific client */
  init(pl: PlClient, grpcTransport: GrpcTransport, httpDispatcher: Dispatcher): Drv;
}
