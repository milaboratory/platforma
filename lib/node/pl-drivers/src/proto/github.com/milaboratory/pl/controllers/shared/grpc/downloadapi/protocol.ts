// @generated by protobuf-ts 2.11.0 with parameter client_generic,optimize_speed,generate_dependencies,force_server_none
// @generated from protobuf file "github.com/milaboratory/pl/controllers/shared/grpc/downloadapi/protocol.proto" (package "MiLaboratories.Controller.Shared", syntax proto3)
// tslint:disable
import { ServiceType } from "@protobuf-ts/runtime-rpc";
import { WireType } from "@protobuf-ts/runtime";
import type { BinaryWriteOptions } from "@protobuf-ts/runtime";
import type { IBinaryWriter } from "@protobuf-ts/runtime";
import type { BinaryReadOptions } from "@protobuf-ts/runtime";
import type { IBinaryReader } from "@protobuf-ts/runtime";
import { UnknownFieldHandler } from "@protobuf-ts/runtime";
import type { PartialMessage } from "@protobuf-ts/runtime";
import { reflectionMergePartial } from "@protobuf-ts/runtime";
import { MessageType } from "@protobuf-ts/runtime";
/**
 * @generated from protobuf message MiLaboratories.Controller.Shared.DownloadAPI
 */
export interface DownloadAPI {
}
/**
 * @generated from protobuf message MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL
 */
export interface DownloadAPI_GetDownloadURL {
}
/**
 * @generated from protobuf message MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.Request
 */
export interface DownloadAPI_GetDownloadURL_Request {
    /**
     * @generated from protobuf field: uint64 resource_id = 1
     */
    resourceId: bigint;
    /**
     * Pass `true` here if the blob will be downloaded from internal network,
     * e.g. controllers could use this if they are trying to download something from internal network.
     * For backward compatibility, by default pl treats all requests as from external network.
     *
     * @generated from protobuf field: bool is_internal_use = 2
     */
    isInternalUse: boolean;
}
/**
 * @generated from protobuf message MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.HTTPHeader
 */
export interface DownloadAPI_GetDownloadURL_HTTPHeader {
    /**
     * @generated from protobuf field: string Name = 1
     */
    name: string;
    /**
     * @generated from protobuf field: string Value = 2
     */
    value: string;
}
/**
 * @generated from protobuf message MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.Response
 */
export interface DownloadAPI_GetDownloadURL_Response {
    /**
     * @generated from protobuf field: string download_url = 1
     */
    downloadUrl: string;
    /**
     * @generated from protobuf field: repeated MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.HTTPHeader headers = 2
     */
    headers: DownloadAPI_GetDownloadURL_HTTPHeader[];
}
// @generated message type with reflection information, may provide speed optimized methods
class DownloadAPI$Type extends MessageType<DownloadAPI> {
    constructor() {
        super("MiLaboratories.Controller.Shared.DownloadAPI", []);
    }
    create(value?: PartialMessage<DownloadAPI>): DownloadAPI {
        const message = globalThis.Object.create((this.messagePrototype!));
        if (value !== undefined)
            reflectionMergePartial<DownloadAPI>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: DownloadAPI): DownloadAPI {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: DownloadAPI, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.DownloadAPI
 */
export const DownloadAPI = new DownloadAPI$Type();
// @generated message type with reflection information, may provide speed optimized methods
class DownloadAPI_GetDownloadURL$Type extends MessageType<DownloadAPI_GetDownloadURL> {
    constructor() {
        super("MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL", []);
    }
    create(value?: PartialMessage<DownloadAPI_GetDownloadURL>): DownloadAPI_GetDownloadURL {
        const message = globalThis.Object.create((this.messagePrototype!));
        if (value !== undefined)
            reflectionMergePartial<DownloadAPI_GetDownloadURL>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: DownloadAPI_GetDownloadURL): DownloadAPI_GetDownloadURL {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: DownloadAPI_GetDownloadURL, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL
 */
export const DownloadAPI_GetDownloadURL = new DownloadAPI_GetDownloadURL$Type();
// @generated message type with reflection information, may provide speed optimized methods
class DownloadAPI_GetDownloadURL_Request$Type extends MessageType<DownloadAPI_GetDownloadURL_Request> {
    constructor() {
        super("MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.Request", [
            { no: 1, name: "resource_id", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 2, name: "is_internal_use", kind: "scalar", T: 8 /*ScalarType.BOOL*/ }
        ]);
    }
    create(value?: PartialMessage<DownloadAPI_GetDownloadURL_Request>): DownloadAPI_GetDownloadURL_Request {
        const message = globalThis.Object.create((this.messagePrototype!));
        message.resourceId = 0n;
        message.isInternalUse = false;
        if (value !== undefined)
            reflectionMergePartial<DownloadAPI_GetDownloadURL_Request>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: DownloadAPI_GetDownloadURL_Request): DownloadAPI_GetDownloadURL_Request {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* uint64 resource_id */ 1:
                    message.resourceId = reader.uint64().toBigInt();
                    break;
                case /* bool is_internal_use */ 2:
                    message.isInternalUse = reader.bool();
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: DownloadAPI_GetDownloadURL_Request, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* uint64 resource_id = 1; */
        if (message.resourceId !== 0n)
            writer.tag(1, WireType.Varint).uint64(message.resourceId);
        /* bool is_internal_use = 2; */
        if (message.isInternalUse !== false)
            writer.tag(2, WireType.Varint).bool(message.isInternalUse);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.Request
 */
export const DownloadAPI_GetDownloadURL_Request = new DownloadAPI_GetDownloadURL_Request$Type();
// @generated message type with reflection information, may provide speed optimized methods
class DownloadAPI_GetDownloadURL_HTTPHeader$Type extends MessageType<DownloadAPI_GetDownloadURL_HTTPHeader> {
    constructor() {
        super("MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.HTTPHeader", [
            { no: 1, name: "Name", kind: "scalar", jsonName: "Name", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "Value", kind: "scalar", jsonName: "Value", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
    create(value?: PartialMessage<DownloadAPI_GetDownloadURL_HTTPHeader>): DownloadAPI_GetDownloadURL_HTTPHeader {
        const message = globalThis.Object.create((this.messagePrototype!));
        message.name = "";
        message.value = "";
        if (value !== undefined)
            reflectionMergePartial<DownloadAPI_GetDownloadURL_HTTPHeader>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: DownloadAPI_GetDownloadURL_HTTPHeader): DownloadAPI_GetDownloadURL_HTTPHeader {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* string Name */ 1:
                    message.name = reader.string();
                    break;
                case /* string Value */ 2:
                    message.value = reader.string();
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: DownloadAPI_GetDownloadURL_HTTPHeader, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* string Name = 1; */
        if (message.name !== "")
            writer.tag(1, WireType.LengthDelimited).string(message.name);
        /* string Value = 2; */
        if (message.value !== "")
            writer.tag(2, WireType.LengthDelimited).string(message.value);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.HTTPHeader
 */
export const DownloadAPI_GetDownloadURL_HTTPHeader = new DownloadAPI_GetDownloadURL_HTTPHeader$Type();
// @generated message type with reflection information, may provide speed optimized methods
class DownloadAPI_GetDownloadURL_Response$Type extends MessageType<DownloadAPI_GetDownloadURL_Response> {
    constructor() {
        super("MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.Response", [
            { no: 1, name: "download_url", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "headers", kind: "message", repeat: 2 /*RepeatType.UNPACKED*/, T: () => DownloadAPI_GetDownloadURL_HTTPHeader }
        ]);
    }
    create(value?: PartialMessage<DownloadAPI_GetDownloadURL_Response>): DownloadAPI_GetDownloadURL_Response {
        const message = globalThis.Object.create((this.messagePrototype!));
        message.downloadUrl = "";
        message.headers = [];
        if (value !== undefined)
            reflectionMergePartial<DownloadAPI_GetDownloadURL_Response>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: DownloadAPI_GetDownloadURL_Response): DownloadAPI_GetDownloadURL_Response {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* string download_url */ 1:
                    message.downloadUrl = reader.string();
                    break;
                case /* repeated MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.HTTPHeader headers */ 2:
                    message.headers.push(DownloadAPI_GetDownloadURL_HTTPHeader.internalBinaryRead(reader, reader.uint32(), options));
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: DownloadAPI_GetDownloadURL_Response, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* string download_url = 1; */
        if (message.downloadUrl !== "")
            writer.tag(1, WireType.LengthDelimited).string(message.downloadUrl);
        /* repeated MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.HTTPHeader headers = 2; */
        for (let i = 0; i < message.headers.length; i++)
            DownloadAPI_GetDownloadURL_HTTPHeader.internalBinaryWrite(message.headers[i], writer.tag(2, WireType.LengthDelimited).fork(), options).join();
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.DownloadAPI.GetDownloadURL.Response
 */
export const DownloadAPI_GetDownloadURL_Response = new DownloadAPI_GetDownloadURL_Response$Type();
/**
 * @generated ServiceType for protobuf service MiLaboratories.Controller.Shared.Download
 */
export const Download = new ServiceType("MiLaboratories.Controller.Shared.Download", [
    { name: "GetDownloadURL", options: { "google.api.http": { get: "/resources/{resource_id}/get-download-url" } }, I: DownloadAPI_GetDownloadURL_Request, O: DownloadAPI_GetDownloadURL_Response }
]);
