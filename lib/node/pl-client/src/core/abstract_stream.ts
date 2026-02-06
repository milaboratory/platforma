import type { DuplexStreamingCall } from "@protobuf-ts/runtime-rpc";

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
type _CompatibilityTest<I extends object, O extends object> =
  DuplexStreamingCall<I, O> extends BiDiStream<I, O> ? true : never;
