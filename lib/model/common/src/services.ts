import type { Branded } from "./branding";
import type { PFrameDriver, PFrameModelDriver } from "./drivers/pframe/driver";
import type { PFrameSpecDriver } from "./drivers/pframe/spec_driver";
import {
  ServiceAlreadyRegisteredError,
  ServiceInvalidIdError,
  ServiceNotRegisteredError,
} from "./errors";

export type ServiceTypesLike<Model = unknown, Ui = unknown> = {
  readonly __types?: { model: Model; ui: Ui };
};

export type InferServiceModel<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<infer M, unknown> ? M : unknown;

export type InferServiceUi<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<unknown, infer U> ? U : unknown;

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
    service<Model, Ui, N extends string = string>(options: {
      readonly type: ServiceType;
      readonly name: N;
    }): Branded<N, ServiceTypesLike<Model, Ui>> {
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
      return name as Branded<N, ServiceTypesLike<Model, Ui>>;
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

class ServiceRegistryBase {
  private readonly factories: Map<string, () => Record<string, Function>>;
  private readonly instances = new Map<string, Record<string, Function>>();

  protected constructor(
    serviceMap: Record<string, ServiceName>,
    factories: Record<string, (() => unknown) | null>,
  ) {
    this.factories = new Map();
    for (const [key, factory] of Object.entries(factories)) {
      if (factory !== null) {
        const serviceId = serviceMap[key] as string;
        this.factories.set(serviceId, factory as () => Record<string, Function>);
      }
    }
  }

  protected getById(id: string): Record<string, Function> {
    if (!this.instances.has(id)) {
      const factory = this.factories.get(id);
      if (!factory) throw new ServiceNotRegisteredError(`Service not registered: ${id}`);
      this.instances.set(id, factory());
    }
    return this.instances.get(id)!;
  }
}

export class ModelServiceRegistry<
  SMap extends Record<string, ServiceName> = typeof Services,
> extends ServiceRegistryBase {
  constructor(serviceMap: SMap, factories: ModelServiceFactoryMap<SMap>) {
    super(serviceMap, factories);
  }

  get<S extends ServiceTypesLike>(
    id: ServiceName<S>,
  ): [unknown] extends [InferServiceModel<S>] ? Record<string, Function> : InferServiceModel<S>;
  get(id: ServiceName): Record<string, Function> {
    return this.getById(id);
  }
}

export class UiServiceRegistry<
  SMap extends Record<string, ServiceName> = typeof Services,
> extends ServiceRegistryBase {
  constructor(serviceMap: SMap, factories: UiServiceFactoryMap<SMap>) {
    super(serviceMap, factories);
  }

  get<S extends ServiceTypesLike>(
    id: ServiceName<S>,
  ): [unknown] extends [InferServiceUi<S>] ? Record<string, Function> : InferServiceUi<S>;
  get(id: ServiceName): Record<string, Function> {
    return this.getById(id);
  }
}

export const Services = {
  PFrameSpec: service<PFrameSpecDriver, PFrameSpecDriver>({ type: "wasm", name: "pframeSpec" }),
  PFrame: service<PFrameModelDriver, PFrameDriver>({ type: "node", name: "pframe" }),
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
