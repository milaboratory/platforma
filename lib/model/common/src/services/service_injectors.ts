/**
 * Service dispatch glue — auto-derived types, method map, and service info builder.
 *
 * The worker-side handler factory (createNodeServiceHandlers) lives in
 * node_service_handlers.ts — that's the only file to edit when adding a
 * new node service.
 */

import type { InferServiceKind, InferServiceUi, ServiceBrand, ServiceName } from "./service_types";
import type { DriverKit } from "../driver_kit";
import { Services } from "./service_declarations";
import { getMethodNames, resolveRequiredServices } from "./service_capabilities";
import { createNodeServiceHandlers } from "./node_service_handlers";

export { createNodeServiceHandlers } from "./node_service_handlers";

type NodeServiceKeys = {
  [K in keyof typeof Services]: InferServiceKind<ServiceBrand<(typeof Services)[K]>> extends "node"
    ? K
    : never;
}[keyof typeof Services];

type MainServiceKeys = {
  [K in keyof typeof Services]: InferServiceKind<ServiceBrand<(typeof Services)[K]>> extends "main"
    ? K
    : never;
}[keyof typeof Services];

type DispatchableServiceKeys = NodeServiceKeys | MainServiceKeys;

/**
 * Auto-derived map of dispatchable service keys (node + main) to their
 * UI-facing interfaces. Node entries are fulfilled by real driver wrappers
 * in the worker; main entries are stubs — their method names are needed
 * only so the UI-side ServiceProxy can build forwarders; runtime calls
 * are routed via IPC by the Electron main-process router.
 */
export type NodeServiceHandlerMap = {
  [K in DispatchableServiceKeys]: InferServiceUi<ServiceBrand<(typeof Services)[K]>>;
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

/**
 * Static map of ServiceName → method names, auto-derived from the handler shape.
 * Computed once at module load. The stub DriverKit is never called — it only
 * provides a target so the closures in createNodeServiceHandlers have own-property
 * keys that getMethodNames can introspect.
 */
export const SERVICE_METHOD_MAP: Readonly<Record<string, string[]>> = (() => {
  const stubKit = new Proxy({} as DriverKit, {
    get: () => new Proxy({}, { get: () => () => {} }),
  });
  const handlers = createNodeServiceHandlers(stubKit);
  const result: Record<string, string[]> = {};
  for (const key of Object.keys(Services) as (keyof typeof Services)[]) {
    const serviceId = Services[key];
    const handler = handlers[key as DispatchableServiceKeys];
    result[serviceId] = handler ? getMethodNames(handler) : [];
  }
  return result;
})();

/** Build service info for a block from its feature flags. */
export function buildServiceInfo(
  featureFlags: Record<string, unknown>,
): Record<ServiceName, string[]> {
  const serviceIds = resolveRequiredServices(featureFlags);
  return Object.fromEntries(
    serviceIds.map((id) => [id, SERVICE_METHOD_MAP[id as string] ?? []]),
  ) as Record<ServiceName, string[]>;
}
