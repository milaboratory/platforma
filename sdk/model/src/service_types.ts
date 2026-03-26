import type {
  Branded,
  ServiceTypesLike,
  InferServiceUi,
  ServiceName,
  Services,
} from "@milaboratories/pl-model-common";
import { UiServiceRegistry } from "@milaboratories/pl-model-common";

type FlagToService<Flag extends string> = Flag extends `requires${infer K}`
  ? K extends keyof typeof Services
    ? (typeof Services)[K]
    : never
  : never;

type InferServiceModel<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<infer M, unknown> ? M : unknown;

type ServiceBrand<T> = T extends Branded<string, infer S extends ServiceTypesLike> ? S : never;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

// Resolve typed services from feature flags
// { requiresPFrameSpec: true } -> { pframeSpec: PFrameSpecDriver }
export type ResolveModelServices<Flags> = UnionToIntersection<
  {
    [K in keyof Flags & `requires${string}`]: Flags[K] extends true
      ? Record<
          FlagToService<K & string> & string,
          InferServiceModel<ServiceBrand<FlagToService<K & string>>>
        >
      : never;
  }[keyof Flags & `requires${string}`]
>;

export type ResolveUiServices<Flags> = UnionToIntersection<
  {
    [K in keyof Flags & `requires${string}`]: Flags[K] extends true
      ? Record<
          FlagToService<K & string> & string,
          InferServiceUi<ServiceBrand<FlagToService<K & string>>>
        >
      : never;
  }[keyof Flags & `requires${string}`]
>;

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
