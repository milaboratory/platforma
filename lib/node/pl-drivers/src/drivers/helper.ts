import { PlClient } from "@milaboratory/pl-client-v2";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { Dispatcher } from "undici";
import { MiLogger } from "@milaboratory/ts-helpers";
import { ResourceInfo, ClientLogs } from "./client_logs";
import type { RpcOptions } from '@protobuf-ts/runtime-rpc';
import { LogsDriver } from "./driver";

