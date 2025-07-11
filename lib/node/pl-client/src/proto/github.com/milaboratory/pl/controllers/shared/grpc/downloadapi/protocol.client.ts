// @generated by protobuf-ts 2.11.0 with parameter client_generic,optimize_speed,generate_dependencies,force_server_none
// @generated from protobuf file "github.com/milaboratory/pl/controllers/shared/grpc/downloadapi/protocol.proto" (package "MiLaboratories.Controller.Shared", syntax proto3)
// tslint:disable
import type { RpcTransport } from "@protobuf-ts/runtime-rpc";
import type { ServiceInfo } from "@protobuf-ts/runtime-rpc";
import { Download } from "./protocol";
import { stackIntercept } from "@protobuf-ts/runtime-rpc";
import type { DownloadAPI_GetDownloadURL_Response } from "./protocol";
import type { DownloadAPI_GetDownloadURL_Request } from "./protocol";
import type { UnaryCall } from "@protobuf-ts/runtime-rpc";
import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
/**
 *
 * Download provides access to any data, that can be downloaded via network.
 *
 *
 * @generated from protobuf service MiLaboratories.Controller.Shared.Download
 */
export interface IDownloadClient {
    /**
     * @generated from protobuf rpc: GetDownloadURL
     */
    getDownloadURL(input: DownloadAPI_GetDownloadURL_Request, options?: RpcOptions): UnaryCall<DownloadAPI_GetDownloadURL_Request, DownloadAPI_GetDownloadURL_Response>;
}
/**
 *
 * Download provides access to any data, that can be downloaded via network.
 *
 *
 * @generated from protobuf service MiLaboratories.Controller.Shared.Download
 */
export class DownloadClient implements IDownloadClient, ServiceInfo {
    typeName = Download.typeName;
    methods = Download.methods;
    options = Download.options;
    constructor(private readonly _transport: RpcTransport) {
    }
    /**
     * @generated from protobuf rpc: GetDownloadURL
     */
    getDownloadURL(input: DownloadAPI_GetDownloadURL_Request, options?: RpcOptions): UnaryCall<DownloadAPI_GetDownloadURL_Request, DownloadAPI_GetDownloadURL_Response> {
        const method = this.methods[0], opt = this._transport.mergeOptions(options);
        return stackIntercept<DownloadAPI_GetDownloadURL_Request, DownloadAPI_GetDownloadURL_Response>("unary", this._transport, method, opt, input);
    }
}
