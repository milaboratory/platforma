import type { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type {
  MethodInfo,
  RpcOptions,
  UnaryCall,
  ServerStreamingCall,
  ClientStreamingCall,
  DuplexStreamingCall,
} from '@protobuf-ts/runtime-rpc';
import type { GrpcCallOptions } from '@protobuf-ts/grpc-transport/build/types/grpc-options';

/**
 * Wraps a GrpcTransport instance and logs all method calls to console.
 */
export class LoggingGrpcTransport {
  constructor(private readonly transport: GrpcTransport) {}

  mergeOptions(options?: Partial<RpcOptions>): RpcOptions {
    return this.transport.mergeOptions(options);
  }

  unary<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    input: I,
    options: GrpcCallOptions,
  ): UnaryCall<I, O> {
    console.log('[GrpcTransport] unary', {
      method: method.name,
      input,
    });
    const result = this.transport.unary(method, input, options);
    console.log('[GrpcTransport] unary ->', {
      name: result.method.name,
      serviceName: result.method.service.typeName,
    });
    return result;
  }

  serverStreaming<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    input: I,
    options: GrpcCallOptions,
  ): ServerStreamingCall<I, O> {
    console.log('[GrpcTransport] serverStreaming', {
      method: method.name,
      input,
    });
    const result = this.transport.serverStreaming(method, input, options);
    console.log('[GrpcTransport] serverStreaming ->', result);
    return result;
  }

  clientStreaming<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    options: GrpcCallOptions,
  ): ClientStreamingCall<I, O> {
    console.log('[GrpcTransport] clientStreaming', {
      method: method.name,
    });
    const result = this.transport.clientStreaming(method, options);
    console.log('[GrpcTransport] clientStreaming ->', result);
    return result;
  }

  duplex<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    options: GrpcCallOptions,
  ): DuplexStreamingCall<I, O> {
    console.log('[GrpcTransport] duplex', {
      method: method.name,
    });
    const result = this.transport.duplex(method, options);
    console.log('[GrpcTransport] duplex ->', {
      name: result.method.name,
      serviceName: result.method.service.typeName,
    });
    return result;
  }

  close(): void {
    console.log('[GrpcTransport] close');
    this.transport.close();
    console.log('[GrpcTransport] close -> (void)');
  }
}
