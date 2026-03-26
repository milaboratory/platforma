import type { Branded } from "./branding";
import type { PFrameDriver, PFrameModelDriver } from "./drivers/pframe/driver";
import type { PFrameSpecDriver } from "./drivers/pframe/spec_driver";
import {
  ServiceAlreadyRegisteredError,
  ServiceInvalidIdError,
  ServiceNotRegisteredError,
} from "./errors";

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

// Service type determines how the Ui side accesses the service:
// - "node": Node.js native addon, runs in main/worker, proxied to renderer via IPC
// - "wasm": WASM module, instantiated directly in the renderer, no IPC
export type ServiceType = "node" | "wasm";

export type ServiceOptions = {
  readonly type: ServiceType;
  readonly name: string;
};

const SERVICE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

// service() and isNodeService share a private map via closure.
// Populated at module load time by the Services const, never modified after.
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

type ServiceBrand<T> = T extends Branded<string, infer S extends ServiceTypesLike> ? S : never;

export type ModelServiceFactoryMap<SMap extends Record<string, ServiceName>> = {
  [K in keyof SMap]: (() => InferServiceModel<ServiceBrand<SMap[K]>>) | null;
};

export type UiServiceFactoryMap<SMap extends Record<string, ServiceName>> = {
  [K in keyof SMap]: (() => InferServiceUi<ServiceBrand<SMap[K]>>) | null;
};

type RegistryName = "ModelServiceRegistry" | "UiServiceRegistry";
type ServiceFactory = () => Record<string, Function>;

class ServiceRegistryBase {
  private readonly registryName: RegistryName;
  private readonly knownServices = new Set<ServiceName>();
  private readonly factories = new Map<ServiceName, ServiceFactory>();
  private readonly instances = new Map<ServiceName, Record<string, Function>>();

  protected constructor(
    registryName: RegistryName,
    serviceMap: Record<string, ServiceName>,
    factories: Record<string, (() => unknown) | null>,
  ) {
    this.registryName = registryName;
    for (const [key, factory] of Object.entries(factories)) {
      const serviceId = serviceMap[key];
      this.knownServices.add(serviceId);
      if (factory !== null) {
        this.factories.set(serviceId, factory as ServiceFactory);
      }
    }
  }

  protected getById(serviceId: ServiceName): Record<string, Function> | null {
    if (!this.knownServices.has(serviceId)) {
      throw new ServiceNotRegisteredError(
        `Service "${serviceId}" is not registered in ${this.registryName}. Add it to the factory map.`,
      );
    }
    let instance = this.instances.get(serviceId);
    if (instance) return instance;

    const factory = this.factories.get(serviceId);
    if (!factory) return null;

    instance = factory();
    this.instances.set(serviceId, instance);
    return instance;
  }
}

export class ModelServiceRegistry<
  SMap extends Record<string, ServiceName> = typeof Services,
> extends ServiceRegistryBase {
  constructor(serviceMap: SMap, factories: ModelServiceFactoryMap<SMap>) {
    super("ModelServiceRegistry", serviceMap, factories);
  }

  get<S extends ServiceTypesLike>(
    id: ServiceName<S>,
  ):
    | ([unknown] extends [InferServiceModel<S>] ? Record<string, Function> : InferServiceModel<S>)
    | null;
  get(id: ServiceName): Record<string, Function> | null {
    return this.getById(id);
  }
}

export class UiServiceRegistry<
  SMap extends Record<string, ServiceName> = typeof Services,
> extends ServiceRegistryBase {
  constructor(serviceMap: SMap, factories: UiServiceFactoryMap<SMap>) {
    super("UiServiceRegistry", serviceMap, factories);
  }

  get<S extends ServiceTypesLike>(
    id: ServiceName<S>,
  ): ([unknown] extends [InferServiceUi<S>] ? Record<string, Function> : InferServiceUi<S>) | null;
  get(id: ServiceName): Record<string, Function> | null {
    return this.getById(id);
  }
}

export const Services = {
  PFrameSpec: service<PFrameSpecDriver, PFrameSpecDriver>()({ type: "wasm", name: "pframeSpec" }),
  PFrame: service<PFrameModelDriver, PFrameDriver>()({ type: "node", name: "pframe" }),
};

// Extract the string literal N from Branded<N, S>.
type ExtractServiceName<T> = T extends Branded<infer N extends string, any> ? N : never;

// Extract the ServiceTypesLike brand from a Branded<string, S>.
type ExtractServiceBrand<T> =
  T extends Branded<string, infer S extends ServiceTypesLike> ? S : never;

/** Model-side driver interfaces keyed by service name literal. Auto-derived from Services. */
export type ModelServiceDrivers = {
  [K in keyof typeof Services as ExtractServiceName<(typeof Services)[K]>]: InferServiceModel<
    ExtractServiceBrand<(typeof Services)[K]>
  >;
};

/** UI-side driver interfaces keyed by service name literal. Auto-derived from Services. */
export type UiServiceDrivers = {
  [K in keyof typeof Services as ExtractServiceName<(typeof Services)[K]>]: InferServiceUi<
    ExtractServiceBrand<(typeof Services)[K]>
  >;
};

/** Auto-derived map from Services keys to their unbranded string name literals.
 *  Adding a service to Services automatically updates this type. */
export type ServiceNameLiterals = {
  [K in keyof typeof Services]: ExtractServiceName<(typeof Services)[K]>;
};

// Extracts the string literal and model interface from a ServiceName.
// Usage: RequireServices<typeof Services.PFrameSpec>
//      → { pframeSpec: PFrameSpecDriver }
// Usage: RequireServices<typeof Services.PFrameSpec | typeof Services.PFrame>
//      → { pframeSpec: PFrameSpecDriver; pframe: PFrameModelDriver }
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

// Auto-derived requires* feature flags from Services keys
// PFrameSpec -> requiresPFrameSpec?: boolean
export type ServiceRequireFlags = {
  [K in keyof typeof Services as `requires${K & string}`]?: boolean;
};

export type KnownServiceName = (typeof Services)[keyof typeof Services] & string;

export function isKnownServiceName(name: string): name is KnownServiceName {
  return Object.values(Services).some((v) => v === name);
}

/** Introspect method names on an instance (including prototype chain).
 *  Uses Object.getOwnPropertyDescriptor to avoid triggering getters. */
export function getMethodNames(instance: Record<string, Function>): string[] {
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

// Accepts Record<string, unknown> so it works with both BlockCodeKnownFeatureFlags
// (from middle layer) and Zod-parsed records (from preload).
export function resolveRequiredServices(flags: Record<string, unknown> | undefined): ServiceName[] {
  if (!flags) return [];
  return (Object.keys(Services) as (keyof typeof Services)[])
    .filter((key) => flags[`requires${key}`] === true)
    .map((key) => Services[key]);
}
