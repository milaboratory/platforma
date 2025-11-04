import type { DuplexStreamingCall } from '@protobuf-ts/runtime-rpc';

export interface RequestsStream<T> {
  /**
   * Send a message down the stream.
   * Only one message can be send at a time.
   */
  send(message: T): Promise<void>;
  /**
   * Complete / close the stream.
   * Can only be called if there is no pending send().
   * No send() should follow this call.
   */
  complete(): Promise<void>;
}

export interface BiDiStream<I extends object, O extends object> {
  requests: RequestsStream<I>;
  responses: AsyncIterable<O>;
}

// Compile-time type compatibility check: BiDiStream is compatible with DuplexStreamingCall implementaions.
type _CompatibilityTest<I extends object, O extends object> = DuplexStreamingCall<I, O> extends BiDiStream<I, O>
  ? true
  : never;

//
// REST Request example with type compatibility:
// TODO: completely remove this from final code! This is only example!
//
import createClient from 'openapi-fetch';
import type { paths } from '../proto-rest/plapi';
import type { MaintenanceAPI_Ping_Response } from '../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api';
export async function ping(): Promise<MaintenanceAPI_Ping_Response> {
  const client = createClient<paths>({ baseUrl: 'http://localhost:8080' });
  return (await client.GET('/v1/ping')).data!;
}
