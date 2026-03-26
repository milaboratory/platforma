import type {
  ServiceTypesLike,
  InferServiceUi,
  ServiceName,
  ServiceNameLiterals,
  ModelServiceDrivers,
  UiServiceDrivers,
} from "@milaboratories/pl-model-common";
import { UiServiceRegistry } from "@milaboratories/pl-model-common";

export type { ModelServiceDrivers, UiServiceDrivers };

// Flag name → service name literal: "requiresPFrameSpec" → "pframeSpec"
type FlagToName<Flag extends string> = Flag extends `requires${infer K}`
  ? K extends keyof ServiceNameLiterals
    ? ServiceNameLiterals[K]
    : never
  : never;

// Extract all required service name literals from feature flags
type RequiredServiceNames<Flags> = {
  [K in keyof Flags & `requires${string}`]: Flags[K] extends true ? FlagToName<K & string> : never;
}[keyof Flags & `requires${string}`];

// Resolve typed services from feature flags
// { requiresPFrameSpec: true } -> { pframeSpec: PFrameSpecDriver }
export type ResolveModelServices<Flags> = Pick<
  ModelServiceDrivers,
  RequiredServiceNames<Flags> & keyof ModelServiceDrivers
>;

export type ResolveUiServices<Flags> = Pick<
  UiServiceDrivers,
  RequiredServiceNames<Flags> & keyof UiServiceDrivers
>;

// Model services resolved from BlockModelV3.INITIAL_BLOCK_FEATURE_FLAGS.
// All V3 blocks get at least these services in their render context.
export type BlockDefaultModelServices = ResolveModelServices<{ readonly requiresPFrameSpec: true }>;

// Service dispatch interface shared by the model render context (sync, QuickJS VM)
// and the UI renderer (async, IPC via contextBridge).
export interface ServiceDispatch {
  getServiceNames(): ServiceName[];
  getServiceMethods(serviceId: ServiceName): string[];
  callServiceMethod(serviceId: ServiceName, method: string, ...args: unknown[]): unknown;
}

// Makes a remote node service appear local.
// Given a service ID, returns an object implementing the service's UI interface.
// Provided by the desktop app (e.g. backed by Electron IPC).
export type NodeServiceProxy = <S extends ServiceTypesLike>(
  serviceId: ServiceName<S>,
) => InferServiceUi<S>;

// Builds a lazy services object from ServiceDispatch and UiServiceRegistry.
// Each service is instantiated on first access.
export function buildServices(
  dispatch: ServiceDispatch,
  registry: UiServiceRegistry,
): Record<string, unknown> {
  return Object.create(
    null,
    Object.fromEntries(
      dispatch.getServiceNames().map((id) => {
        let fetched = false;
        let cached: unknown;
        return [
          id,
          {
            enumerable: true,
            get() {
              if (!fetched) {
                cached = registry.get(id);
                fetched = true;
              }
              return cached;
            },
          },
        ];
      }),
    ),
  );
}

// Builds a NodeServiceProxy from a ServiceDispatch.
// Each service method call is forwarded to dispatch.callServiceMethod.
export function createNodeServiceProxy(dispatch: ServiceDispatch): NodeServiceProxy {
  return ((serviceId: ServiceName) =>
    Object.freeze(
      Object.fromEntries(
        dispatch
          .getServiceMethods(serviceId)
          .map((method) => [
            method,
            async (...args: unknown[]) => dispatch.callServiceMethod(serviceId, method, ...args),
          ]),
      ),
    )) as NodeServiceProxy;
}
