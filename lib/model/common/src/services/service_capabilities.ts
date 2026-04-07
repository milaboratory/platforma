import type { ServiceName, ServiceRequireFlags } from "./service_types";
import { Services } from "./service_declarations";
import type { SupportedRequirement } from "../flags/flag_utils";

/**
 * All service-related `requires*` capability flag names, auto-derived from Services.
 * Single source of truth — use this everywhere runtime capabilities are registered.
 */
export const SERVICE_CAPABILITY_FLAGS: readonly SupportedRequirement[] = Object.keys(Services).map(
  (key) => `requires${key}` as SupportedRequirement,
);

/**
 * Register all service capability flags with the given callback.
 * Works with both `RuntimeCapabilities.addSupportedRequirement`
 * and `MiddleLayer.addRuntimeCapability`.
 */
export function registerServiceCapabilities(
  register: (flag: SupportedRequirement, value: true) => void,
): void {
  for (const flag of SERVICE_CAPABILITY_FLAGS) {
    register(flag, true);
  }
}

/**
 * Resolve which services are required by the given feature flags.
 * Accepts Record<string, unknown> so it works with both BlockCodeKnownFeatureFlags
 * (from middle layer) and Zod-parsed records (from preload).
 */
export function resolveRequiredServices(flags: Record<string, unknown> | undefined): ServiceName[] {
  if (!flags) return [];
  return (Object.keys(Services) as (keyof typeof Services)[])
    .filter((key) => flags[`requires${key}`] === true)
    .map((key) => Services[key]);
}

export type KnownServiceName = (typeof Services)[keyof typeof Services] & string;

export function isKnownServiceName(name: string): name is KnownServiceName {
  return Object.values(Services).some((v) => v === name);
}

/** All service require flags set to true, auto-generated from Services.
 *  Used to distinguish service-related feature flags from non-service flags. */
export const SERVICE_FEATURE_FLAGS: { readonly [K in keyof ServiceRequireFlags]-?: true } =
  Object.fromEntries(Object.keys(Services).map((key) => [`requires${key}`, true])) as any;

/** Introspect method names on an instance (including prototype chain).
 *  Uses Object.getOwnPropertyDescriptor to avoid triggering getters. */
export function getMethodNames<T extends object>(instance: T): string[] {
  const methods = new Set<string>();
  let proto: object | null = instance;
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (key !== "constructor" && typeof descriptor?.value === "function") {
        methods.add(key);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...methods];
}
