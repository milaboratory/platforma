// @generated by protobuf-ts 2.11.0 with parameter client_generic,optimize_speed,generate_dependencies,force_server_none
// @generated from protobuf file "github.com/milaboratory/pl/controllers/shared/grpc/progressapi/protocol.proto" (package "MiLaboratories.Controller.Shared", syntax proto3)
// tslint:disable
import type { RpcTransport } from "@protobuf-ts/runtime-rpc";
import type { ServiceInfo } from "@protobuf-ts/runtime-rpc";
import { Progress } from "./protocol";
import type { ProgressAPI_RealtimeStatus_Response } from "./protocol";
import type { ProgressAPI_RealtimeStatus_Request } from "./protocol";
import type { ServerStreamingCall } from "@protobuf-ts/runtime-rpc";
import { stackIntercept } from "@protobuf-ts/runtime-rpc";
import type { ProgressAPI_GetStatus_Response } from "./protocol";
import type { ProgressAPI_GetStatus_Request } from "./protocol";
import type { UnaryCall } from "@protobuf-ts/runtime-rpc";
import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
/**
 *
 * Progress provides access to progress of any long-running process associated with resource.
 *
 *
 * @generated from protobuf service MiLaboratories.Controller.Shared.Progress
 */
export interface IProgressClient {
    /**
     * @generated from protobuf rpc: GetStatus
     */
    getStatus(input: ProgressAPI_GetStatus_Request, options?: RpcOptions): UnaryCall<ProgressAPI_GetStatus_Request, ProgressAPI_GetStatus_Response>;
    /**
     * @generated from protobuf rpc: RealtimeStatus
     */
    realtimeStatus(input: ProgressAPI_RealtimeStatus_Request, options?: RpcOptions): ServerStreamingCall<ProgressAPI_RealtimeStatus_Request, ProgressAPI_RealtimeStatus_Response>;
}
/**
 *
 * Progress provides access to progress of any long-running process associated with resource.
 *
 *
 * @generated from protobuf service MiLaboratories.Controller.Shared.Progress
 */
export class ProgressClient implements IProgressClient, ServiceInfo {
    typeName = Progress.typeName;
    methods = Progress.methods;
    options = Progress.options;
    constructor(private readonly _transport: RpcTransport) {
    }
    /**
     * @generated from protobuf rpc: GetStatus
     */
    getStatus(input: ProgressAPI_GetStatus_Request, options?: RpcOptions): UnaryCall<ProgressAPI_GetStatus_Request, ProgressAPI_GetStatus_Response> {
        const method = this.methods[0], opt = this._transport.mergeOptions(options);
        return stackIntercept<ProgressAPI_GetStatus_Request, ProgressAPI_GetStatus_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: RealtimeStatus
     */
    realtimeStatus(input: ProgressAPI_RealtimeStatus_Request, options?: RpcOptions): ServerStreamingCall<ProgressAPI_RealtimeStatus_Request, ProgressAPI_RealtimeStatus_Response> {
        const method = this.methods[1], opt = this._transport.mergeOptions(options);
        return stackIntercept<ProgressAPI_RealtimeStatus_Request, ProgressAPI_RealtimeStatus_Response>("serverStreaming", this._transport, method, opt, input);
    }
}
