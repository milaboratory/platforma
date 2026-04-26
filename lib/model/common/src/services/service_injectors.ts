/**
 * Service dispatch glue — auto-derived types, method maps, and service info builder.
 *
 * The worker-side handler factory (createNodeServiceHandlers) lives in
 * node_service_handlers.ts — that's the only file to edit when adding a
 * new node service. Method-name registries for UI and model sides are
 * derived directly from the `uiMethods` / `modelMethods` declarations in
 * service_declarations.ts — no factory introspection, no stubs.
 */

import type { InferServiceKind, InferServiceUi, ServiceBrand, ServiceName } from "./service_types";
import type { DriverKit } from "../driver_kit";
import { Services } from "./service_declarations";
import { getServiceModelMethods, getServiceUiMethods } from "./service_types";
import { resolveRequiredServices } from "./service_capabilities";
import { createNodeServiceHandlers } from "./node_service_handlers";

export { createNodeServiceHandlers } from "./node_service_handlers";

type NodeServiceKeys = {
  [K in keyof typeof Services]: InferServiceKind<ServiceBrand<(typeof Services)[K]>> extends "node"
    ? K
    : never;
}[keyof typeof Services];

/**
 * Auto-derived map of node service keys to their UI-facing interfaces.
 * Fulfilled by real driver wrappers in the worker. Main services are
 * dispatched by the Electron main-process router and never reach this
 * map; wasm services are instantiated locally on each consumer.
 */
export type NodeServiceHandlerMap = {
  [K in NodeServiceKeys]: InferServiceUi<ServiceBrand<(typeof Services)[K]>>;
};

let cachedKit: DriverKit | undefined;
let cachedHandlers: NodeServiceHandlerMap | undefined;

function getOrCreateHandlers(driverKit: DriverKit): NodeServiceHandlerMap {
  if (!cachedHandlers || cachedKit !== driverKit) {
    cachedKit = driverKit;
    cachedHandlers = createNodeServiceHandlers(driverKit);
  }
  return cachedHandlers;
}

/**
 * Resolve the worker-side handler object for a given service ID. Caches
 * per DriverKit reference. Called from the worker's IPC dispatch path.
 */
export function resolveNodeServiceHandler(
  driverKit: DriverKit,
  serviceId: ServiceName,
): NodeServiceHandlerMap[keyof NodeServiceHandlerMap] | null {
  const handlers = getOrCreateHandlers(driverKit);
  const key = Object.keys(Services).find(
    (k) => Services[k as keyof typeof Services] === serviceId,
  ) as NodeServiceKeys | undefined;
  if (!key) return null;
  return handlers[key];
}

function buildMethodMap(
  pick: (id: ServiceName) => readonly string[],
): Readonly<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  for (const id of Object.values(Services)) {
    result[id as string] = [...pick(id)];
  }
  return result;
}

/**
 * UI-side method names per service. Drives ServiceProxy forwarder
 * construction in the renderer.
 */
export const SERVICE_METHOD_MAP: Readonly<Record<string, string[]>> =
  buildMethodMap(getServiceUiMethods);

/**
 * Model-side method names per service. Drives the workflow VM bridge
 * (see pl-middle-layer js_render).
 */
export const MODEL_SERVICE_METHOD_MAP: Readonly<Record<string, string[]>> =
  buildMethodMap(getServiceModelMethods);

/** Build service info for a block from its feature flags. */
export function buildServiceInfo(
  featureFlags: Record<string, unknown>,
): Record<ServiceName, string[]> {
  const serviceIds = resolveRequiredServices(featureFlags);
  return Object.fromEntries(
    serviceIds.map((id) => [id, SERVICE_METHOD_MAP[id as string] ?? []]),
  ) as Record<ServiceName, string[]>;
}
