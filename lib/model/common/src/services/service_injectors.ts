/**
 * UI service injectors — auto-derived types, method map, and service info builder.
 *
 * The factory (createUiServiceInjectors) lives in service_injector_factory.ts —
 * that's the only file to edit when adding a new node service.
 */

import type {
  InferServiceKind,
  InferServiceUi,
  ServiceName,
  ServiceTypesLike,
} from "./service_types";
import type { Branded } from "../branding";
import type { DriverKit } from "../driver_kit";
import { Services } from "./service_declarations";
import { getMethodNames, resolveRequiredServices } from "./service_capabilities";
import { createUiServiceInjectors } from "./service_injector_factory";

export { createUiServiceInjectors } from "./service_injector_factory";

type ServiceBrand<T> = T extends Branded<string, infer S extends ServiceTypesLike> ? S : never;

type NodeServiceKeys = {
  [K in keyof typeof Services]: InferServiceKind<ServiceBrand<(typeof Services)[K]>> extends "node"
    ? K
    : never;
}[keyof typeof Services];

/** Auto-derived map of node service keys to their UI-side driver interfaces. */
export type UiServiceInjectorMap = {
  [K in NodeServiceKeys]: InferServiceUi<ServiceBrand<(typeof Services)[K]>>;
};

let cachedKit: DriverKit | undefined;
let cachedInjectors: UiServiceInjectorMap | undefined;

function getOrCreateInjectors(driverKit: DriverKit): UiServiceInjectorMap {
  if (!cachedInjectors || cachedKit !== driverKit) {
    cachedKit = driverKit;
    cachedInjectors = createUiServiceInjectors(driverKit);
  }
  return cachedInjectors;
}

/** Resolve the injector for a given service ID. Caches injectors per DriverKit reference. */
export function resolveUiInjector(
  driverKit: DriverKit,
  serviceId: ServiceName,
): UiServiceInjectorMap[keyof UiServiceInjectorMap] | null {
  const injectors = getOrCreateInjectors(driverKit);
  const key = Object.keys(Services).find(
    (k) => Services[k as keyof typeof Services] === serviceId,
  ) as NodeServiceKeys | undefined;
  if (!key) return null;
  return injectors[key];
}

/**
 * Static map of ServiceName → method names, auto-derived from the injector shape.
 * Computed once at module load. The stub DriverKit is never called — it only
 * provides a target so the closures in createUiServiceInjectors have own-property
 * keys that getMethodNames can introspect.
 */
export const SERVICE_METHOD_MAP: Readonly<Record<string, string[]>> = (() => {
  const stubKit = new Proxy({} as DriverKit, {
    get: () => new Proxy({}, { get: () => () => {} }),
  });
  const injectors = createUiServiceInjectors(stubKit);
  const result: Record<string, string[]> = {};
  for (const key of Object.keys(Services) as (keyof typeof Services)[]) {
    const serviceId = Services[key];
    const injector = injectors[key as NodeServiceKeys];
    result[serviceId] = injector ? getMethodNames(injector) : [];
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
