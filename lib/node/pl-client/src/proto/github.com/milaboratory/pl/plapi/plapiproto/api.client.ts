// @generated by protobuf-ts 2.9.4 with parameter client_generic,optimize_speed,generate_dependencies,force_server_none
// @generated from protobuf file "github.com/milaboratory/pl/plapi/plapiproto/api.proto" (package "MiLaboratories.PL.API", syntax proto3)
// tslint:disable
import type { RpcTransport } from "@protobuf-ts/runtime-rpc";
import type { ServiceInfo } from "@protobuf-ts/runtime-rpc";
import { Platform } from "./api";
import type { MaintenanceAPI_Ping_Response } from "./api";
import type { MaintenanceAPI_Ping_Request } from "./api";
import type { MiscAPI_ListResourceTypes_Response } from "./api";
import type { MiscAPI_ListResourceTypes_Request } from "./api";
import type { AuthAPI_GetJWTToken_Response } from "./api";
import type { AuthAPI_GetJWTToken_Request } from "./api";
import type { AuthAPI_ListMethods_Response } from "./api";
import type { AuthAPI_ListMethods_Request } from "./api";
import type { LocksAPI_Lease_Release_Response } from "./api";
import type { LocksAPI_Lease_Release_Request } from "./api";
import type { LocksAPI_Lease_Update_Response } from "./api";
import type { LocksAPI_Lease_Update_Request } from "./api";
import type { LocksAPI_Lease_Create_Response } from "./api";
import type { LocksAPI_Lease_Create_Request } from "./api";
import type { ControllerAPI_ClearFeatures_Response } from "./api";
import type { ControllerAPI_ClearFeatures_Request } from "./api";
import type { ControllerAPI_SetFeatures_Response } from "./api";
import type { ControllerAPI_SetFeatures_Request } from "./api";
import type { ControllerAPI_GetUrl_Response } from "./api";
import type { ControllerAPI_GetUrl_Request } from "./api";
import type { ControllerAPI_RemoveAliasesAndUrls_Response } from "./api";
import type { ControllerAPI_RemoveAliasesAndUrls_Request } from "./api";
import type { ControllerAPI_WriteAliasesAndUrls_Response } from "./api";
import type { ControllerAPI_WriteAliasesAndUrls_Request } from "./api";
import type { ControllerAPI_GetNotifications_Response } from "./api";
import type { ControllerAPI_GetNotifications_Request } from "./api";
import type { ControllerAPI_AttachSubscription_Response } from "./api";
import type { ControllerAPI_AttachSubscription_Request } from "./api";
import type { ControllerAPI_Update_Response } from "./api";
import type { ControllerAPI_Update_Request } from "./api";
import type { ControllerAPI_Get_Response } from "./api";
import type { ControllerAPI_Get_Request } from "./api";
import type { ControllerAPI_Exists_Response } from "./api";
import type { ControllerAPI_Exists_Request } from "./api";
import type { ControllerAPI_Create_Response } from "./api";
import type { ControllerAPI_Create_Request } from "./api";
import type { ControllerAPI_Deregister_Response } from "./api";
import type { ControllerAPI_Deregister_Request } from "./api";
import type { ControllerAPI_Register_Response } from "./api";
import type { ControllerAPI_Register_Request } from "./api";
import type { NotificationAPI_Get_Response } from "./api";
import type { NotificationAPI_Get_Request } from "./api";
import type { SubscriptionAPI_DetachFilter_Response } from "./api";
import type { SubscriptionAPI_DetachFilter_Request } from "./api";
import type { SubscriptionAPI_AttachFilter_Response } from "./api";
import type { SubscriptionAPI_AttachFilter_Request } from "./api";
import type { TxAPI_Sync_Response } from "./api";
import type { TxAPI_Sync_Request } from "./api";
import type { UnaryCall } from "@protobuf-ts/runtime-rpc";
import { stackIntercept } from "@protobuf-ts/runtime-rpc";
import type { TxAPI_ServerMessage } from "./api";
import type { TxAPI_ClientMessage } from "./api";
import type { DuplexStreamingCall } from "@protobuf-ts/runtime-rpc";
import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service MiLaboratories.PL.API.Platform
 */
export interface IPlatformClient {
    /**
     *
     * Transactions
     *
     *
     * @generated from protobuf rpc: Tx(stream MiLaboratories.PL.API.TxAPI.ClientMessage) returns (stream MiLaboratories.PL.API.TxAPI.ServerMessage);
     */
    tx(options?: RpcOptions): DuplexStreamingCall<TxAPI_ClientMessage, TxAPI_ServerMessage>;
    /**
     * @generated from protobuf rpc: TxSync(MiLaboratories.PL.API.TxAPI.Sync.Request) returns (MiLaboratories.PL.API.TxAPI.Sync.Response);
     */
    txSync(input: TxAPI_Sync_Request, options?: RpcOptions): UnaryCall<TxAPI_Sync_Request, TxAPI_Sync_Response>;
    /**
     *
     * Subscriptions
     *
     *
     * @generated from protobuf rpc: SubscriptionAttachFilter(MiLaboratories.PL.API.SubscriptionAPI.AttachFilter.Request) returns (MiLaboratories.PL.API.SubscriptionAPI.AttachFilter.Response);
     */
    subscriptionAttachFilter(input: SubscriptionAPI_AttachFilter_Request, options?: RpcOptions): UnaryCall<SubscriptionAPI_AttachFilter_Request, SubscriptionAPI_AttachFilter_Response>;
    /**
     * @generated from protobuf rpc: SubscriptionDetachFilter(MiLaboratories.PL.API.SubscriptionAPI.DetachFilter.Request) returns (MiLaboratories.PL.API.SubscriptionAPI.DetachFilter.Response);
     */
    subscriptionDetachFilter(input: SubscriptionAPI_DetachFilter_Request, options?: RpcOptions): UnaryCall<SubscriptionAPI_DetachFilter_Request, SubscriptionAPI_DetachFilter_Response>;
    /**
     * @generated from protobuf rpc: NotificationsGet(MiLaboratories.PL.API.NotificationAPI.Get.Request) returns (MiLaboratories.PL.API.NotificationAPI.Get.Response);
     */
    notificationsGet(input: NotificationAPI_Get_Request, options?: RpcOptions): UnaryCall<NotificationAPI_Get_Request, NotificationAPI_Get_Response>;
    /**
     *
     * Controllers
     *
     *
     * @generated from protobuf rpc: ControllerRegister(MiLaboratories.PL.API.ControllerAPI.Register.Request) returns (MiLaboratories.PL.API.ControllerAPI.Register.Response);
     */
    controllerRegister(input: ControllerAPI_Register_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Register_Request, ControllerAPI_Register_Response>;
    /**
     * @generated from protobuf rpc: ControllerDeregister(MiLaboratories.PL.API.ControllerAPI.Deregister.Request) returns (MiLaboratories.PL.API.ControllerAPI.Deregister.Response);
     */
    controllerDeregister(input: ControllerAPI_Deregister_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Deregister_Request, ControllerAPI_Deregister_Response>;
    /**
     * @generated from protobuf rpc: ControllerCreate(MiLaboratories.PL.API.ControllerAPI.Create.Request) returns (MiLaboratories.PL.API.ControllerAPI.Create.Response);
     */
    controllerCreate(input: ControllerAPI_Create_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Create_Request, ControllerAPI_Create_Response>;
    /**
     * @generated from protobuf rpc: ControllerExists(MiLaboratories.PL.API.ControllerAPI.Exists.Request) returns (MiLaboratories.PL.API.ControllerAPI.Exists.Response);
     */
    controllerExists(input: ControllerAPI_Exists_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Exists_Request, ControllerAPI_Exists_Response>;
    /**
     * @generated from protobuf rpc: ControllerGet(MiLaboratories.PL.API.ControllerAPI.Get.Request) returns (MiLaboratories.PL.API.ControllerAPI.Get.Response);
     */
    controllerGet(input: ControllerAPI_Get_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Get_Request, ControllerAPI_Get_Response>;
    /**
     * @generated from protobuf rpc: ControllerUpdate(MiLaboratories.PL.API.ControllerAPI.Update.Request) returns (MiLaboratories.PL.API.ControllerAPI.Update.Response);
     */
    controllerUpdate(input: ControllerAPI_Update_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Update_Request, ControllerAPI_Update_Response>;
    /**
     * @generated from protobuf rpc: ControllerAttachSubscription(MiLaboratories.PL.API.ControllerAPI.AttachSubscription.Request) returns (MiLaboratories.PL.API.ControllerAPI.AttachSubscription.Response);
     */
    controllerAttachSubscription(input: ControllerAPI_AttachSubscription_Request, options?: RpcOptions): UnaryCall<ControllerAPI_AttachSubscription_Request, ControllerAPI_AttachSubscription_Response>;
    /**
     * @generated from protobuf rpc: GetControllerNotifications(MiLaboratories.PL.API.ControllerAPI.GetNotifications.Request) returns (MiLaboratories.PL.API.ControllerAPI.GetNotifications.Response);
     */
    getControllerNotifications(input: ControllerAPI_GetNotifications_Request, options?: RpcOptions): UnaryCall<ControllerAPI_GetNotifications_Request, ControllerAPI_GetNotifications_Response>;
    /**
     * @generated from protobuf rpc: WriteControllerAliasesAndUrls(MiLaboratories.PL.API.ControllerAPI.WriteAliasesAndUrls.Request) returns (MiLaboratories.PL.API.ControllerAPI.WriteAliasesAndUrls.Response);
     */
    writeControllerAliasesAndUrls(input: ControllerAPI_WriteAliasesAndUrls_Request, options?: RpcOptions): UnaryCall<ControllerAPI_WriteAliasesAndUrls_Request, ControllerAPI_WriteAliasesAndUrls_Response>;
    /**
     * @generated from protobuf rpc: RemoveControllerAliasesAndUrls(MiLaboratories.PL.API.ControllerAPI.RemoveAliasesAndUrls.Request) returns (MiLaboratories.PL.API.ControllerAPI.RemoveAliasesAndUrls.Response);
     */
    removeControllerAliasesAndUrls(input: ControllerAPI_RemoveAliasesAndUrls_Request, options?: RpcOptions): UnaryCall<ControllerAPI_RemoveAliasesAndUrls_Request, ControllerAPI_RemoveAliasesAndUrls_Response>;
    /**
     * @generated from protobuf rpc: GetControllerUrl(MiLaboratories.PL.API.ControllerAPI.GetUrl.Request) returns (MiLaboratories.PL.API.ControllerAPI.GetUrl.Response);
     */
    getControllerUrl(input: ControllerAPI_GetUrl_Request, options?: RpcOptions): UnaryCall<ControllerAPI_GetUrl_Request, ControllerAPI_GetUrl_Response>;
    /**
     * @generated from protobuf rpc: ControllerSetFeatures(MiLaboratories.PL.API.ControllerAPI.SetFeatures.Request) returns (MiLaboratories.PL.API.ControllerAPI.SetFeatures.Response);
     */
    controllerSetFeatures(input: ControllerAPI_SetFeatures_Request, options?: RpcOptions): UnaryCall<ControllerAPI_SetFeatures_Request, ControllerAPI_SetFeatures_Response>;
    /**
     * @generated from protobuf rpc: ControllerClearFeatures(MiLaboratories.PL.API.ControllerAPI.ClearFeatures.Request) returns (MiLaboratories.PL.API.ControllerAPI.ClearFeatures.Response);
     */
    controllerClearFeatures(input: ControllerAPI_ClearFeatures_Request, options?: RpcOptions): UnaryCall<ControllerAPI_ClearFeatures_Request, ControllerAPI_ClearFeatures_Response>;
    /**
     *
     * Locks
     *
     *
     * @generated from protobuf rpc: LeaseResource(MiLaboratories.PL.API.LocksAPI.Lease.Create.Request) returns (MiLaboratories.PL.API.LocksAPI.Lease.Create.Response);
     */
    leaseResource(input: LocksAPI_Lease_Create_Request, options?: RpcOptions): UnaryCall<LocksAPI_Lease_Create_Request, LocksAPI_Lease_Create_Response>;
    /**
     * @generated from protobuf rpc: UpdateLease(MiLaboratories.PL.API.LocksAPI.Lease.Update.Request) returns (MiLaboratories.PL.API.LocksAPI.Lease.Update.Response);
     */
    updateLease(input: LocksAPI_Lease_Update_Request, options?: RpcOptions): UnaryCall<LocksAPI_Lease_Update_Request, LocksAPI_Lease_Update_Response>;
    /**
     * @generated from protobuf rpc: ReleaseLease(MiLaboratories.PL.API.LocksAPI.Lease.Release.Request) returns (MiLaboratories.PL.API.LocksAPI.Lease.Release.Response);
     */
    releaseLease(input: LocksAPI_Lease_Release_Request, options?: RpcOptions): UnaryCall<LocksAPI_Lease_Release_Request, LocksAPI_Lease_Release_Response>;
    /**
     *
     * Authentication
     *
     *
     * @generated from protobuf rpc: AuthMethods(MiLaboratories.PL.API.AuthAPI.ListMethods.Request) returns (MiLaboratories.PL.API.AuthAPI.ListMethods.Response);
     */
    authMethods(input: AuthAPI_ListMethods_Request, options?: RpcOptions): UnaryCall<AuthAPI_ListMethods_Request, AuthAPI_ListMethods_Response>;
    /**
     * @generated from protobuf rpc: GetJWTToken(MiLaboratories.PL.API.AuthAPI.GetJWTToken.Request) returns (MiLaboratories.PL.API.AuthAPI.GetJWTToken.Response);
     */
    getJWTToken(input: AuthAPI_GetJWTToken_Request, options?: RpcOptions): UnaryCall<AuthAPI_GetJWTToken_Request, AuthAPI_GetJWTToken_Response>;
    /**
     *
     * Other stuff
     *
     *
     * @generated from protobuf rpc: ListResourceTypes(MiLaboratories.PL.API.MiscAPI.ListResourceTypes.Request) returns (MiLaboratories.PL.API.MiscAPI.ListResourceTypes.Response);
     */
    listResourceTypes(input: MiscAPI_ListResourceTypes_Request, options?: RpcOptions): UnaryCall<MiscAPI_ListResourceTypes_Request, MiscAPI_ListResourceTypes_Response>;
    /**
     *
     * Various service requests
     *
     *
     * @generated from protobuf rpc: Ping(MiLaboratories.PL.API.MaintenanceAPI.Ping.Request) returns (MiLaboratories.PL.API.MaintenanceAPI.Ping.Response);
     */
    ping(input: MaintenanceAPI_Ping_Request, options?: RpcOptions): UnaryCall<MaintenanceAPI_Ping_Request, MaintenanceAPI_Ping_Response>;
}
/**
 * @generated from protobuf service MiLaboratories.PL.API.Platform
 */
export class PlatformClient implements IPlatformClient, ServiceInfo {
    typeName = Platform.typeName;
    methods = Platform.methods;
    options = Platform.options;
    constructor(private readonly _transport: RpcTransport) {
    }
    /**
     *
     * Transactions
     *
     *
     * @generated from protobuf rpc: Tx(stream MiLaboratories.PL.API.TxAPI.ClientMessage) returns (stream MiLaboratories.PL.API.TxAPI.ServerMessage);
     */
    tx(options?: RpcOptions): DuplexStreamingCall<TxAPI_ClientMessage, TxAPI_ServerMessage> {
        const method = this.methods[0], opt = this._transport.mergeOptions(options);
        return stackIntercept<TxAPI_ClientMessage, TxAPI_ServerMessage>("duplex", this._transport, method, opt);
    }
    /**
     * @generated from protobuf rpc: TxSync(MiLaboratories.PL.API.TxAPI.Sync.Request) returns (MiLaboratories.PL.API.TxAPI.Sync.Response);
     */
    txSync(input: TxAPI_Sync_Request, options?: RpcOptions): UnaryCall<TxAPI_Sync_Request, TxAPI_Sync_Response> {
        const method = this.methods[1], opt = this._transport.mergeOptions(options);
        return stackIntercept<TxAPI_Sync_Request, TxAPI_Sync_Response>("unary", this._transport, method, opt, input);
    }
    /**
     *
     * Subscriptions
     *
     *
     * @generated from protobuf rpc: SubscriptionAttachFilter(MiLaboratories.PL.API.SubscriptionAPI.AttachFilter.Request) returns (MiLaboratories.PL.API.SubscriptionAPI.AttachFilter.Response);
     */
    subscriptionAttachFilter(input: SubscriptionAPI_AttachFilter_Request, options?: RpcOptions): UnaryCall<SubscriptionAPI_AttachFilter_Request, SubscriptionAPI_AttachFilter_Response> {
        const method = this.methods[2], opt = this._transport.mergeOptions(options);
        return stackIntercept<SubscriptionAPI_AttachFilter_Request, SubscriptionAPI_AttachFilter_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: SubscriptionDetachFilter(MiLaboratories.PL.API.SubscriptionAPI.DetachFilter.Request) returns (MiLaboratories.PL.API.SubscriptionAPI.DetachFilter.Response);
     */
    subscriptionDetachFilter(input: SubscriptionAPI_DetachFilter_Request, options?: RpcOptions): UnaryCall<SubscriptionAPI_DetachFilter_Request, SubscriptionAPI_DetachFilter_Response> {
        const method = this.methods[3], opt = this._transport.mergeOptions(options);
        return stackIntercept<SubscriptionAPI_DetachFilter_Request, SubscriptionAPI_DetachFilter_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: NotificationsGet(MiLaboratories.PL.API.NotificationAPI.Get.Request) returns (MiLaboratories.PL.API.NotificationAPI.Get.Response);
     */
    notificationsGet(input: NotificationAPI_Get_Request, options?: RpcOptions): UnaryCall<NotificationAPI_Get_Request, NotificationAPI_Get_Response> {
        const method = this.methods[4], opt = this._transport.mergeOptions(options);
        return stackIntercept<NotificationAPI_Get_Request, NotificationAPI_Get_Response>("unary", this._transport, method, opt, input);
    }
    /**
     *
     * Controllers
     *
     *
     * @generated from protobuf rpc: ControllerRegister(MiLaboratories.PL.API.ControllerAPI.Register.Request) returns (MiLaboratories.PL.API.ControllerAPI.Register.Response);
     */
    controllerRegister(input: ControllerAPI_Register_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Register_Request, ControllerAPI_Register_Response> {
        const method = this.methods[5], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_Register_Request, ControllerAPI_Register_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: ControllerDeregister(MiLaboratories.PL.API.ControllerAPI.Deregister.Request) returns (MiLaboratories.PL.API.ControllerAPI.Deregister.Response);
     */
    controllerDeregister(input: ControllerAPI_Deregister_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Deregister_Request, ControllerAPI_Deregister_Response> {
        const method = this.methods[6], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_Deregister_Request, ControllerAPI_Deregister_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: ControllerCreate(MiLaboratories.PL.API.ControllerAPI.Create.Request) returns (MiLaboratories.PL.API.ControllerAPI.Create.Response);
     */
    controllerCreate(input: ControllerAPI_Create_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Create_Request, ControllerAPI_Create_Response> {
        const method = this.methods[7], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_Create_Request, ControllerAPI_Create_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: ControllerExists(MiLaboratories.PL.API.ControllerAPI.Exists.Request) returns (MiLaboratories.PL.API.ControllerAPI.Exists.Response);
     */
    controllerExists(input: ControllerAPI_Exists_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Exists_Request, ControllerAPI_Exists_Response> {
        const method = this.methods[8], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_Exists_Request, ControllerAPI_Exists_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: ControllerGet(MiLaboratories.PL.API.ControllerAPI.Get.Request) returns (MiLaboratories.PL.API.ControllerAPI.Get.Response);
     */
    controllerGet(input: ControllerAPI_Get_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Get_Request, ControllerAPI_Get_Response> {
        const method = this.methods[9], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_Get_Request, ControllerAPI_Get_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: ControllerUpdate(MiLaboratories.PL.API.ControllerAPI.Update.Request) returns (MiLaboratories.PL.API.ControllerAPI.Update.Response);
     */
    controllerUpdate(input: ControllerAPI_Update_Request, options?: RpcOptions): UnaryCall<ControllerAPI_Update_Request, ControllerAPI_Update_Response> {
        const method = this.methods[10], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_Update_Request, ControllerAPI_Update_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: ControllerAttachSubscription(MiLaboratories.PL.API.ControllerAPI.AttachSubscription.Request) returns (MiLaboratories.PL.API.ControllerAPI.AttachSubscription.Response);
     */
    controllerAttachSubscription(input: ControllerAPI_AttachSubscription_Request, options?: RpcOptions): UnaryCall<ControllerAPI_AttachSubscription_Request, ControllerAPI_AttachSubscription_Response> {
        const method = this.methods[11], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_AttachSubscription_Request, ControllerAPI_AttachSubscription_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: GetControllerNotifications(MiLaboratories.PL.API.ControllerAPI.GetNotifications.Request) returns (MiLaboratories.PL.API.ControllerAPI.GetNotifications.Response);
     */
    getControllerNotifications(input: ControllerAPI_GetNotifications_Request, options?: RpcOptions): UnaryCall<ControllerAPI_GetNotifications_Request, ControllerAPI_GetNotifications_Response> {
        const method = this.methods[12], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_GetNotifications_Request, ControllerAPI_GetNotifications_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: WriteControllerAliasesAndUrls(MiLaboratories.PL.API.ControllerAPI.WriteAliasesAndUrls.Request) returns (MiLaboratories.PL.API.ControllerAPI.WriteAliasesAndUrls.Response);
     */
    writeControllerAliasesAndUrls(input: ControllerAPI_WriteAliasesAndUrls_Request, options?: RpcOptions): UnaryCall<ControllerAPI_WriteAliasesAndUrls_Request, ControllerAPI_WriteAliasesAndUrls_Response> {
        const method = this.methods[13], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_WriteAliasesAndUrls_Request, ControllerAPI_WriteAliasesAndUrls_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: RemoveControllerAliasesAndUrls(MiLaboratories.PL.API.ControllerAPI.RemoveAliasesAndUrls.Request) returns (MiLaboratories.PL.API.ControllerAPI.RemoveAliasesAndUrls.Response);
     */
    removeControllerAliasesAndUrls(input: ControllerAPI_RemoveAliasesAndUrls_Request, options?: RpcOptions): UnaryCall<ControllerAPI_RemoveAliasesAndUrls_Request, ControllerAPI_RemoveAliasesAndUrls_Response> {
        const method = this.methods[14], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_RemoveAliasesAndUrls_Request, ControllerAPI_RemoveAliasesAndUrls_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: GetControllerUrl(MiLaboratories.PL.API.ControllerAPI.GetUrl.Request) returns (MiLaboratories.PL.API.ControllerAPI.GetUrl.Response);
     */
    getControllerUrl(input: ControllerAPI_GetUrl_Request, options?: RpcOptions): UnaryCall<ControllerAPI_GetUrl_Request, ControllerAPI_GetUrl_Response> {
        const method = this.methods[15], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_GetUrl_Request, ControllerAPI_GetUrl_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: ControllerSetFeatures(MiLaboratories.PL.API.ControllerAPI.SetFeatures.Request) returns (MiLaboratories.PL.API.ControllerAPI.SetFeatures.Response);
     */
    controllerSetFeatures(input: ControllerAPI_SetFeatures_Request, options?: RpcOptions): UnaryCall<ControllerAPI_SetFeatures_Request, ControllerAPI_SetFeatures_Response> {
        const method = this.methods[16], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_SetFeatures_Request, ControllerAPI_SetFeatures_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: ControllerClearFeatures(MiLaboratories.PL.API.ControllerAPI.ClearFeatures.Request) returns (MiLaboratories.PL.API.ControllerAPI.ClearFeatures.Response);
     */
    controllerClearFeatures(input: ControllerAPI_ClearFeatures_Request, options?: RpcOptions): UnaryCall<ControllerAPI_ClearFeatures_Request, ControllerAPI_ClearFeatures_Response> {
        const method = this.methods[17], opt = this._transport.mergeOptions(options);
        return stackIntercept<ControllerAPI_ClearFeatures_Request, ControllerAPI_ClearFeatures_Response>("unary", this._transport, method, opt, input);
    }
    /**
     *
     * Locks
     *
     *
     * @generated from protobuf rpc: LeaseResource(MiLaboratories.PL.API.LocksAPI.Lease.Create.Request) returns (MiLaboratories.PL.API.LocksAPI.Lease.Create.Response);
     */
    leaseResource(input: LocksAPI_Lease_Create_Request, options?: RpcOptions): UnaryCall<LocksAPI_Lease_Create_Request, LocksAPI_Lease_Create_Response> {
        const method = this.methods[18], opt = this._transport.mergeOptions(options);
        return stackIntercept<LocksAPI_Lease_Create_Request, LocksAPI_Lease_Create_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: UpdateLease(MiLaboratories.PL.API.LocksAPI.Lease.Update.Request) returns (MiLaboratories.PL.API.LocksAPI.Lease.Update.Response);
     */
    updateLease(input: LocksAPI_Lease_Update_Request, options?: RpcOptions): UnaryCall<LocksAPI_Lease_Update_Request, LocksAPI_Lease_Update_Response> {
        const method = this.methods[19], opt = this._transport.mergeOptions(options);
        return stackIntercept<LocksAPI_Lease_Update_Request, LocksAPI_Lease_Update_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: ReleaseLease(MiLaboratories.PL.API.LocksAPI.Lease.Release.Request) returns (MiLaboratories.PL.API.LocksAPI.Lease.Release.Response);
     */
    releaseLease(input: LocksAPI_Lease_Release_Request, options?: RpcOptions): UnaryCall<LocksAPI_Lease_Release_Request, LocksAPI_Lease_Release_Response> {
        const method = this.methods[20], opt = this._transport.mergeOptions(options);
        return stackIntercept<LocksAPI_Lease_Release_Request, LocksAPI_Lease_Release_Response>("unary", this._transport, method, opt, input);
    }
    /**
     *
     * Authentication
     *
     *
     * @generated from protobuf rpc: AuthMethods(MiLaboratories.PL.API.AuthAPI.ListMethods.Request) returns (MiLaboratories.PL.API.AuthAPI.ListMethods.Response);
     */
    authMethods(input: AuthAPI_ListMethods_Request, options?: RpcOptions): UnaryCall<AuthAPI_ListMethods_Request, AuthAPI_ListMethods_Response> {
        const method = this.methods[21], opt = this._transport.mergeOptions(options);
        return stackIntercept<AuthAPI_ListMethods_Request, AuthAPI_ListMethods_Response>("unary", this._transport, method, opt, input);
    }
    /**
     * @generated from protobuf rpc: GetJWTToken(MiLaboratories.PL.API.AuthAPI.GetJWTToken.Request) returns (MiLaboratories.PL.API.AuthAPI.GetJWTToken.Response);
     */
    getJWTToken(input: AuthAPI_GetJWTToken_Request, options?: RpcOptions): UnaryCall<AuthAPI_GetJWTToken_Request, AuthAPI_GetJWTToken_Response> {
        const method = this.methods[22], opt = this._transport.mergeOptions(options);
        return stackIntercept<AuthAPI_GetJWTToken_Request, AuthAPI_GetJWTToken_Response>("unary", this._transport, method, opt, input);
    }
    /**
     *
     * Other stuff
     *
     *
     * @generated from protobuf rpc: ListResourceTypes(MiLaboratories.PL.API.MiscAPI.ListResourceTypes.Request) returns (MiLaboratories.PL.API.MiscAPI.ListResourceTypes.Response);
     */
    listResourceTypes(input: MiscAPI_ListResourceTypes_Request, options?: RpcOptions): UnaryCall<MiscAPI_ListResourceTypes_Request, MiscAPI_ListResourceTypes_Response> {
        const method = this.methods[23], opt = this._transport.mergeOptions(options);
        return stackIntercept<MiscAPI_ListResourceTypes_Request, MiscAPI_ListResourceTypes_Response>("unary", this._transport, method, opt, input);
    }
    /**
     *
     * Various service requests
     *
     *
     * @generated from protobuf rpc: Ping(MiLaboratories.PL.API.MaintenanceAPI.Ping.Request) returns (MiLaboratories.PL.API.MaintenanceAPI.Ping.Response);
     */
    ping(input: MaintenanceAPI_Ping_Request, options?: RpcOptions): UnaryCall<MaintenanceAPI_Ping_Request, MaintenanceAPI_Ping_Response> {
        const method = this.methods[24], opt = this._transport.mergeOptions(options);
        return stackIntercept<MaintenanceAPI_Ping_Request, MaintenanceAPI_Ping_Response>("unary", this._transport, method, opt, input);
    }
}