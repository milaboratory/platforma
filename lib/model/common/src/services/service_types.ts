import type { Branded } from "../branding";
import { ServiceAlreadyRegisteredError, ServiceInvalidIdError } from "../errors";
import type { Services } from "./service_declarations";

export type ServiceTypesLike<
  Model = unknown,
  Ui = unknown,
  Kind extends ServiceType = ServiceType,
> = {
  readonly __types?: { model: Model; ui: Ui; kind: Kind };
};

export type InferServiceModel<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<infer M, unknown, ServiceType> ? M : unknown;

export type InferServiceUi<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<unknown, infer U, ServiceType> ? U : unknown;

export type InferServiceKind<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<unknown, unknown, infer K> ? K : ServiceType;

export type ServiceName<S extends ServiceTypesLike = ServiceTypesLike> = Branded<string, S>;

export type ServiceType = "node" | "wasm";

const SERVICE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

export const { service, isNodeService } = (() => {
  const typeMap = new Map<string, ServiceType>();
  return {
    service<Model, Ui>() {
      return <K extends ServiceType, N extends string>(options: {
        readonly type: K;
        readonly name: N;
      }): Branded<N, ServiceTypesLike<Model, Ui, K>> => {
        const { name, type } = options;
        if (!SERVICE_ID_PATTERN.test(name)) {
          throw new ServiceInvalidIdError(
            `Invalid service ID "${name}": must match ${SERVICE_ID_PATTERN}`,
          );
        }
        if (typeMap.has(name)) {
          throw new ServiceAlreadyRegisteredError(`Service "${name}" already registered`);
        }
        typeMap.set(name, type);
        return name as Branded<N, ServiceTypesLike<Model, Ui, K>>;
      };
    },
    isNodeService(id: ServiceName): boolean {
      return typeMap.get(id) === "node";
    },
  };
})();

export function serviceFnKey(serviceId: string, method = ""): string {
  return `service:${serviceId}:${method}`;
}

export type ServiceBrand<T> =
  T extends Branded<string, infer S extends ServiceTypesLike> ? S : never;

export type ModelServiceFactoryMap<SMap extends Record<string, ServiceName>> = {
  [K in keyof SMap]: (() => InferServiceModel<ServiceBrand<SMap[K]>>) | null;
};

export type UiServiceFactoryMap<SMap extends Record<string, ServiceName>> = {
  [K in keyof SMap]: (() => InferServiceUi<ServiceBrand<SMap[K]>>) | null;
};

/** Contract between any service provider and any service consumer. */
export interface ServiceDispatch {
  getServiceNames(): ServiceName[];
  getServiceMethods(serviceId: ServiceName): string[];
  callServiceMethod(serviceId: ServiceName, method: string, ...args: unknown[]): unknown;
}

// Auto-derived types from the Services const in service_declarations.ts.
// Adding a service to Services automatically updates all of these.

type SMap = typeof Services;

type ExtractServiceName<T> = T extends Branded<infer N extends string, any> ? N : never;

/** Model-side service interfaces keyed by service name literal. */
export type ModelServices = {
  [K in keyof SMap as ExtractServiceName<SMap[K]>]: InferServiceModel<ServiceBrand<SMap[K]>>;
};

/** UI-side service interfaces keyed by service name literal. */
export type UiServices = {
  [K in keyof SMap as ExtractServiceName<SMap[K]>]: InferServiceUi<ServiceBrand<SMap[K]>>;
};

/** Map from Services keys to their unbranded string name literals. */
export type ServiceNameLiterals = {
  [K in keyof SMap]: ExtractServiceName<SMap[K]>;
};

/** Auto-derived requires* feature flags from Services keys. */
export type ServiceRequireFlags = {
  [K in keyof SMap as `requires${K & string}`]?: boolean;
};

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

export type RequireServices<T extends ServiceName> = UnionToIntersection<
  T extends Branded<infer N extends string, infer S extends ServiceTypesLike>
    ? Record<N, InferServiceModel<S>>
    : never
>;
