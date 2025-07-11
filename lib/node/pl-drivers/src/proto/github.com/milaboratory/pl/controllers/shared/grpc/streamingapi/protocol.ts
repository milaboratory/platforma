// @generated by protobuf-ts 2.11.0 with parameter client_generic,optimize_speed,generate_dependencies,force_server_none
// @generated from protobuf file "github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol.proto" (package "MiLaboratories.Controller.Shared", syntax proto3)
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
 * @generated from protobuf message MiLaboratories.Controller.Shared.StreamingAPI
 */
export interface StreamingAPI {
}
/**
 * @generated from protobuf message MiLaboratories.Controller.Shared.StreamingAPI.StreamBinary
 */
export interface StreamingAPI_StreamBinary {
    /**
     * <resource_id> of Stream resource, that keeps info on item to be streamed.
     *
     * @generated from protobuf field: uint64 resource_id = 1
     */
    resourceId: bigint;
    /**
     * <offset> makes streamer to perform seek operation to given offset before sending the data.
     *
     * @generated from protobuf field: int64 offset = 2
     */
    offset: bigint;
    /**
     * <chunk_size> limits the maximum size of <data> for each response message in stream.
     *
     * Default value: 32 768 (32 KiB)
     * Max value: 3900 * 1024 (3.9 MiB)
     *
     * @generated from protobuf field: optional uint32 chunk_size = 11
     */
    chunkSize?: number;
    /**
     * <read_limit> allows client to limit total data sent from server.
     * This limit is aggregation of all data, sent in all chunks.
     * E.g. to read 2000 bytes of data in chunks of at most
     * 130 bytes, use <chunk_size> = 130; <read_limit> = 2000.
     * For storage item of appropriate size this settings will result in
     * 16 messages from server: 15 of 130 bytes and one of 50 bytes.
     *
     * @generated from protobuf field: optional int64 read_limit = 20
     */
    readLimit?: bigint;
}
/**
 * @generated from protobuf message MiLaboratories.Controller.Shared.StreamingAPI.ReadBinary
 */
export interface StreamingAPI_ReadBinary {
    /**
     * <resource_id> of Stream resource, that keeps info on item to be streamed.
     *
     * @generated from protobuf field: uint64 resource_id = 1
     */
    resourceId: bigint;
    /**
     * <offset> makes streamer to perform seek operation to given offset before sending the data.
     *
     * @generated from protobuf field: int64 offset = 2
     */
    offset: bigint;
    /**
     * <chunk_size> limits the maximum size of <data> for response message in stream.
     *
     * Default value: 32 768 (32 KiB)
     * Max value: 3900 * 1024 (3.9 MiB)
     *
     * @generated from protobuf field: optional uint32 chunk_size = 11
     */
    chunkSize?: number;
}
/**
 * @generated from protobuf message MiLaboratories.Controller.Shared.StreamingAPI.StreamText
 */
export interface StreamingAPI_StreamText {
    /**
     * <resource_id> of Stream resource, that keeps info on item to be streamed.
     *
     * @generated from protobuf field: uint64 resource_id = 1
     */
    resourceId: bigint;
    /**
     * <offset> makes streamer to perform seek operation to given offset before sending the contents.
     * This offset is taken in BYTES, as it eases streaming recovery after client reconnection or controller restart.
     * Client can just use the <new_offset> value of the last response from server to continue streaming after reconnection.
     *
     * @generated from protobuf field: int64 offset = 2
     */
    offset: bigint;
    /**
     * <read_limit> allows client to limit total data sent from server.
     * This limit is aggregation of all data, sent in all chunks, measured
     * in lines of text.
     * E.g. to read top 1000 lines from stream source, use <read_limit> = 1000.
     * When both <read_limit> and <search>/<search_re> are set, the <read_limit> is applied first.
     * this is equivalent to 'head -n <read_limit> | grep <search>'.
     *
     * @generated from protobuf field: optional int64 read_limit = 20
     */
    readLimit?: bigint;
    /**
     * <search> is substring for line search pattern.
     * This option makes controller to send to the client only lines, that
     * have given substring.
     *
     * @generated from protobuf field: optional string search = 21
     */
    search?: string;
    /**
     * <search_re> is regular expression for line search pattern.
     * This option makes controller to send to the client only lines, that
     * match given regular expression.
     *
     * @generated from protobuf field: optional string search_re = 22
     */
    searchRe?: string;
}
/**
 * @generated from protobuf message MiLaboratories.Controller.Shared.StreamingAPI.ReadText
 */
export interface StreamingAPI_ReadText {
    /**
     * <resource_id> of Stream resource, that keeps info on item to be streamed.
     *
     * @generated from protobuf field: uint64 resource_id = 1
     */
    resourceId: bigint;
    /**
     * <offset> makes streamer to perform seek operation to given offset before sending the contents.
     * This offset is taken in BYTES, as it eases streaming recovery after client reconnection or controller restart.
     * Client can just use the <new_offset> value of the last response from server to continue streaming after reconnection.
     *
     * @generated from protobuf field: int64 offset = 2
     */
    offset: bigint;
    /**
     * <read_limit> allows client to limit total data sent from server.
     * Measured in lines of text.
     * E.g. to read top 1000 lines from stream source, use <read_limit> = 1000.
     * When both <read_limit> and <search>/<search_re> are set, the <read_limit> is applied first.
     * this is equivalent to 'head -n <read_limit> | grep <search>'.
     * At most 3.9 MiB (3900 * 1024 KiB) of data is returned in single read regardless of <read_limit> option
     * Only full lines of text are returned except for the last line from the completed source
     * (the one that is not expected to have new data, like blob in storage)
     *
     * @generated from protobuf field: optional int64 read_limit = 20
     */
    readLimit?: bigint;
    /**
     * <search> is substring for line search pattern.
     * This option makes controller to send to the client only lines, that
     * have given substring.
     *
     * @generated from protobuf field: optional string search = 21
     */
    search?: string;
    /**
     * <search_re> is regular expression for line search pattern.
     * This option makes controller to send to the client only lines, that
     * match given regular expression.
     *
     * @generated from protobuf field: optional string search_re = 22
     */
    searchRe?: string;
}
/**
 * @generated from protobuf message MiLaboratories.Controller.Shared.StreamingAPI.LastLines
 */
export interface StreamingAPI_LastLines {
    /**
     * <resource_id> of Stream resource, that keeps info on item to be streamed.
     *
     * @generated from protobuf field: uint64 resource_id = 1
     */
    resourceId: bigint;
    /**
     * <offset> makes streamer to perform seek operation to given offset before sending the contents.
     * This offset is taken in BYTES, as it eases streaming recovery after client reconnection or controller restart.
     * By default, LastLines starts to treat the data source from the very last byte available in data stream
     * at the moment of call, but client can set the server to start from earlier position.
     *
     * @generated from protobuf field: optional int64 offset = 2
     */
    offset?: bigint;
    /**
     * <line_count> makes streamer to return up to <line_count> lines to the client.
     * Default value: 1
     *
     * @generated from protobuf field: optional int32 line_count = 3
     */
    lineCount?: number;
    /**
     * <search> is substring for line search pattern.
     * This option makes controller to send to the client only lines, that
     * have given substring.
     *
     * @generated from protobuf field: optional string search = 21
     */
    search?: string;
    /**
     * <search_re> is regular expression for line search pattern.
     * This option makes controller to send to the client only lines, that
     * match given regular expression.
     *
     * @generated from protobuf field: optional string search_re = 22
     */
    searchRe?: string;
}
/**
 * @generated from protobuf message MiLaboratories.Controller.Shared.StreamingAPI.Response
 */
export interface StreamingAPI_Response {
    /**
     * data chunk from item, starting from the <new_offset> of the previous message in the same stream.
     *
     * @generated from protobuf field: bytes data = 1
     */
    data: Uint8Array;
    /**
     * <size> is the actual size of the streamed item at the moment of this message.
     * This might be not a final amount of streamed data, as stream source can be updated
     * by other independent process (e.g., data is written to log file).
     * This field in combination with <new_offset> shows, how far the client is from the end
     * of the data right now.
     *
     * @generated from protobuf field: uint64 size = 2
     */
    size: bigint;
    /**
     * <new_offset> is the new offset in bytes from the start of the streamed item,
     * including size of <data> in current response.
     * Call to Stream rpc with <offset> = <new_offset> will continue
     * streaming from the place of last received message
     * (e.g. <offset> = <new_offset> - 1 will repeat the last byte of
     * previously received <data>)
     *
     * @generated from protobuf field: uint64 new_offset = 3
     */
    newOffset: bigint;
}
// @generated message type with reflection information, may provide speed optimized methods
class StreamingAPI$Type extends MessageType<StreamingAPI> {
    constructor() {
        super("MiLaboratories.Controller.Shared.StreamingAPI", []);
    }
    create(value?: PartialMessage<StreamingAPI>): StreamingAPI {
        const message = globalThis.Object.create((this.messagePrototype!));
        if (value !== undefined)
            reflectionMergePartial<StreamingAPI>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: StreamingAPI): StreamingAPI {
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
    internalBinaryWrite(message: StreamingAPI, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.StreamingAPI
 */
export const StreamingAPI = new StreamingAPI$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamingAPI_StreamBinary$Type extends MessageType<StreamingAPI_StreamBinary> {
    constructor() {
        super("MiLaboratories.Controller.Shared.StreamingAPI.StreamBinary", [
            { no: 1, name: "resource_id", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 2, name: "offset", kind: "scalar", T: 3 /*ScalarType.INT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 11, name: "chunk_size", kind: "scalar", opt: true, T: 13 /*ScalarType.UINT32*/ },
            { no: 20, name: "read_limit", kind: "scalar", opt: true, T: 3 /*ScalarType.INT64*/, L: 0 /*LongType.BIGINT*/ }
        ]);
    }
    create(value?: PartialMessage<StreamingAPI_StreamBinary>): StreamingAPI_StreamBinary {
        const message = globalThis.Object.create((this.messagePrototype!));
        message.resourceId = 0n;
        message.offset = 0n;
        if (value !== undefined)
            reflectionMergePartial<StreamingAPI_StreamBinary>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: StreamingAPI_StreamBinary): StreamingAPI_StreamBinary {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* uint64 resource_id */ 1:
                    message.resourceId = reader.uint64().toBigInt();
                    break;
                case /* int64 offset */ 2:
                    message.offset = reader.int64().toBigInt();
                    break;
                case /* optional uint32 chunk_size */ 11:
                    message.chunkSize = reader.uint32();
                    break;
                case /* optional int64 read_limit */ 20:
                    message.readLimit = reader.int64().toBigInt();
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
    internalBinaryWrite(message: StreamingAPI_StreamBinary, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* uint64 resource_id = 1; */
        if (message.resourceId !== 0n)
            writer.tag(1, WireType.Varint).uint64(message.resourceId);
        /* int64 offset = 2; */
        if (message.offset !== 0n)
            writer.tag(2, WireType.Varint).int64(message.offset);
        /* optional uint32 chunk_size = 11; */
        if (message.chunkSize !== undefined)
            writer.tag(11, WireType.Varint).uint32(message.chunkSize);
        /* optional int64 read_limit = 20; */
        if (message.readLimit !== undefined)
            writer.tag(20, WireType.Varint).int64(message.readLimit);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.StreamingAPI.StreamBinary
 */
export const StreamingAPI_StreamBinary = new StreamingAPI_StreamBinary$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamingAPI_ReadBinary$Type extends MessageType<StreamingAPI_ReadBinary> {
    constructor() {
        super("MiLaboratories.Controller.Shared.StreamingAPI.ReadBinary", [
            { no: 1, name: "resource_id", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 2, name: "offset", kind: "scalar", T: 3 /*ScalarType.INT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 11, name: "chunk_size", kind: "scalar", opt: true, T: 13 /*ScalarType.UINT32*/ }
        ]);
    }
    create(value?: PartialMessage<StreamingAPI_ReadBinary>): StreamingAPI_ReadBinary {
        const message = globalThis.Object.create((this.messagePrototype!));
        message.resourceId = 0n;
        message.offset = 0n;
        if (value !== undefined)
            reflectionMergePartial<StreamingAPI_ReadBinary>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: StreamingAPI_ReadBinary): StreamingAPI_ReadBinary {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* uint64 resource_id */ 1:
                    message.resourceId = reader.uint64().toBigInt();
                    break;
                case /* int64 offset */ 2:
                    message.offset = reader.int64().toBigInt();
                    break;
                case /* optional uint32 chunk_size */ 11:
                    message.chunkSize = reader.uint32();
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
    internalBinaryWrite(message: StreamingAPI_ReadBinary, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* uint64 resource_id = 1; */
        if (message.resourceId !== 0n)
            writer.tag(1, WireType.Varint).uint64(message.resourceId);
        /* int64 offset = 2; */
        if (message.offset !== 0n)
            writer.tag(2, WireType.Varint).int64(message.offset);
        /* optional uint32 chunk_size = 11; */
        if (message.chunkSize !== undefined)
            writer.tag(11, WireType.Varint).uint32(message.chunkSize);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.StreamingAPI.ReadBinary
 */
export const StreamingAPI_ReadBinary = new StreamingAPI_ReadBinary$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamingAPI_StreamText$Type extends MessageType<StreamingAPI_StreamText> {
    constructor() {
        super("MiLaboratories.Controller.Shared.StreamingAPI.StreamText", [
            { no: 1, name: "resource_id", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 2, name: "offset", kind: "scalar", T: 3 /*ScalarType.INT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 20, name: "read_limit", kind: "scalar", opt: true, T: 3 /*ScalarType.INT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 21, name: "search", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ },
            { no: 22, name: "search_re", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ }
        ]);
    }
    create(value?: PartialMessage<StreamingAPI_StreamText>): StreamingAPI_StreamText {
        const message = globalThis.Object.create((this.messagePrototype!));
        message.resourceId = 0n;
        message.offset = 0n;
        if (value !== undefined)
            reflectionMergePartial<StreamingAPI_StreamText>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: StreamingAPI_StreamText): StreamingAPI_StreamText {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* uint64 resource_id */ 1:
                    message.resourceId = reader.uint64().toBigInt();
                    break;
                case /* int64 offset */ 2:
                    message.offset = reader.int64().toBigInt();
                    break;
                case /* optional int64 read_limit */ 20:
                    message.readLimit = reader.int64().toBigInt();
                    break;
                case /* optional string search */ 21:
                    message.search = reader.string();
                    break;
                case /* optional string search_re */ 22:
                    message.searchRe = reader.string();
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
    internalBinaryWrite(message: StreamingAPI_StreamText, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* uint64 resource_id = 1; */
        if (message.resourceId !== 0n)
            writer.tag(1, WireType.Varint).uint64(message.resourceId);
        /* int64 offset = 2; */
        if (message.offset !== 0n)
            writer.tag(2, WireType.Varint).int64(message.offset);
        /* optional int64 read_limit = 20; */
        if (message.readLimit !== undefined)
            writer.tag(20, WireType.Varint).int64(message.readLimit);
        /* optional string search = 21; */
        if (message.search !== undefined)
            writer.tag(21, WireType.LengthDelimited).string(message.search);
        /* optional string search_re = 22; */
        if (message.searchRe !== undefined)
            writer.tag(22, WireType.LengthDelimited).string(message.searchRe);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.StreamingAPI.StreamText
 */
export const StreamingAPI_StreamText = new StreamingAPI_StreamText$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamingAPI_ReadText$Type extends MessageType<StreamingAPI_ReadText> {
    constructor() {
        super("MiLaboratories.Controller.Shared.StreamingAPI.ReadText", [
            { no: 1, name: "resource_id", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 2, name: "offset", kind: "scalar", T: 3 /*ScalarType.INT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 20, name: "read_limit", kind: "scalar", opt: true, T: 3 /*ScalarType.INT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 21, name: "search", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ },
            { no: 22, name: "search_re", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ }
        ]);
    }
    create(value?: PartialMessage<StreamingAPI_ReadText>): StreamingAPI_ReadText {
        const message = globalThis.Object.create((this.messagePrototype!));
        message.resourceId = 0n;
        message.offset = 0n;
        if (value !== undefined)
            reflectionMergePartial<StreamingAPI_ReadText>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: StreamingAPI_ReadText): StreamingAPI_ReadText {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* uint64 resource_id */ 1:
                    message.resourceId = reader.uint64().toBigInt();
                    break;
                case /* int64 offset */ 2:
                    message.offset = reader.int64().toBigInt();
                    break;
                case /* optional int64 read_limit */ 20:
                    message.readLimit = reader.int64().toBigInt();
                    break;
                case /* optional string search */ 21:
                    message.search = reader.string();
                    break;
                case /* optional string search_re */ 22:
                    message.searchRe = reader.string();
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
    internalBinaryWrite(message: StreamingAPI_ReadText, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* uint64 resource_id = 1; */
        if (message.resourceId !== 0n)
            writer.tag(1, WireType.Varint).uint64(message.resourceId);
        /* int64 offset = 2; */
        if (message.offset !== 0n)
            writer.tag(2, WireType.Varint).int64(message.offset);
        /* optional int64 read_limit = 20; */
        if (message.readLimit !== undefined)
            writer.tag(20, WireType.Varint).int64(message.readLimit);
        /* optional string search = 21; */
        if (message.search !== undefined)
            writer.tag(21, WireType.LengthDelimited).string(message.search);
        /* optional string search_re = 22; */
        if (message.searchRe !== undefined)
            writer.tag(22, WireType.LengthDelimited).string(message.searchRe);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.StreamingAPI.ReadText
 */
export const StreamingAPI_ReadText = new StreamingAPI_ReadText$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamingAPI_LastLines$Type extends MessageType<StreamingAPI_LastLines> {
    constructor() {
        super("MiLaboratories.Controller.Shared.StreamingAPI.LastLines", [
            { no: 1, name: "resource_id", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 2, name: "offset", kind: "scalar", opt: true, T: 3 /*ScalarType.INT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 3, name: "line_count", kind: "scalar", opt: true, T: 5 /*ScalarType.INT32*/ },
            { no: 21, name: "search", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ },
            { no: 22, name: "search_re", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ }
        ]);
    }
    create(value?: PartialMessage<StreamingAPI_LastLines>): StreamingAPI_LastLines {
        const message = globalThis.Object.create((this.messagePrototype!));
        message.resourceId = 0n;
        if (value !== undefined)
            reflectionMergePartial<StreamingAPI_LastLines>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: StreamingAPI_LastLines): StreamingAPI_LastLines {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* uint64 resource_id */ 1:
                    message.resourceId = reader.uint64().toBigInt();
                    break;
                case /* optional int64 offset */ 2:
                    message.offset = reader.int64().toBigInt();
                    break;
                case /* optional int32 line_count */ 3:
                    message.lineCount = reader.int32();
                    break;
                case /* optional string search */ 21:
                    message.search = reader.string();
                    break;
                case /* optional string search_re */ 22:
                    message.searchRe = reader.string();
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
    internalBinaryWrite(message: StreamingAPI_LastLines, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* uint64 resource_id = 1; */
        if (message.resourceId !== 0n)
            writer.tag(1, WireType.Varint).uint64(message.resourceId);
        /* optional int64 offset = 2; */
        if (message.offset !== undefined)
            writer.tag(2, WireType.Varint).int64(message.offset);
        /* optional int32 line_count = 3; */
        if (message.lineCount !== undefined)
            writer.tag(3, WireType.Varint).int32(message.lineCount);
        /* optional string search = 21; */
        if (message.search !== undefined)
            writer.tag(21, WireType.LengthDelimited).string(message.search);
        /* optional string search_re = 22; */
        if (message.searchRe !== undefined)
            writer.tag(22, WireType.LengthDelimited).string(message.searchRe);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.StreamingAPI.LastLines
 */
export const StreamingAPI_LastLines = new StreamingAPI_LastLines$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamingAPI_Response$Type extends MessageType<StreamingAPI_Response> {
    constructor() {
        super("MiLaboratories.Controller.Shared.StreamingAPI.Response", [
            { no: 1, name: "data", kind: "scalar", T: 12 /*ScalarType.BYTES*/ },
            { no: 2, name: "size", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 3, name: "new_offset", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 0 /*LongType.BIGINT*/ }
        ]);
    }
    create(value?: PartialMessage<StreamingAPI_Response>): StreamingAPI_Response {
        const message = globalThis.Object.create((this.messagePrototype!));
        message.data = new Uint8Array(0);
        message.size = 0n;
        message.newOffset = 0n;
        if (value !== undefined)
            reflectionMergePartial<StreamingAPI_Response>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: StreamingAPI_Response): StreamingAPI_Response {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* bytes data */ 1:
                    message.data = reader.bytes();
                    break;
                case /* uint64 size */ 2:
                    message.size = reader.uint64().toBigInt();
                    break;
                case /* uint64 new_offset */ 3:
                    message.newOffset = reader.uint64().toBigInt();
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
    internalBinaryWrite(message: StreamingAPI_Response, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* bytes data = 1; */
        if (message.data.length)
            writer.tag(1, WireType.LengthDelimited).bytes(message.data);
        /* uint64 size = 2; */
        if (message.size !== 0n)
            writer.tag(2, WireType.Varint).uint64(message.size);
        /* uint64 new_offset = 3; */
        if (message.newOffset !== 0n)
            writer.tag(3, WireType.Varint).uint64(message.newOffset);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message MiLaboratories.Controller.Shared.StreamingAPI.Response
 */
export const StreamingAPI_Response = new StreamingAPI_Response$Type();
/**
 * @generated ServiceType for protobuf service MiLaboratories.Controller.Shared.Streaming
 */
export const Streaming = new ServiceType("MiLaboratories.Controller.Shared.Streaming", [
    { name: "StreamBinary", serverStreaming: true, options: {}, I: StreamingAPI_StreamBinary, O: StreamingAPI_Response },
    { name: "ReadBinary", options: {}, I: StreamingAPI_ReadBinary, O: StreamingAPI_Response },
    { name: "StreamText", serverStreaming: true, options: {}, I: StreamingAPI_StreamText, O: StreamingAPI_Response },
    { name: "ReadText", options: {}, I: StreamingAPI_ReadText, O: StreamingAPI_Response },
    { name: "LastLines", options: {}, I: StreamingAPI_LastLines, O: StreamingAPI_Response }
]);
