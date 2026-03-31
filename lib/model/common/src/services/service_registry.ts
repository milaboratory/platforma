import type {
  ServiceTypesLike,
  InferServiceModel,
  InferServiceUi,
  ServiceName,
} from "./service_types";
import { ServiceNotRegisteredError } from "../errors";

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

  async dispose(): Promise<void> {
    for (const instance of this.instances.values()) {
      if (Symbol.asyncDispose in instance) {
        await (instance as AsyncDisposable)[Symbol.asyncDispose]();
      } else if (Symbol.dispose in instance) {
        (instance as Disposable)[Symbol.dispose]();
      }
    }
    this.instances.clear();
  }

  protected getById(serviceId: ServiceName): Record<string, Function> | null {
    if (!this.knownServices.has(serviceId)) {
      throw new ServiceNotRegisteredError(
        `Service "${serviceId}" is not registered in ${this.registryName}. Add it to the factory map.`,
      );
    }
    if (this.instances.has(serviceId)) return this.instances.get(serviceId)!;

    const factory = this.factories.get(serviceId);
    if (!factory) return null;

    const instance = factory();
    this.instances.set(serviceId, instance);
    return instance;
  }
}

export class ModelServiceRegistry<
  SMap extends Record<string, ServiceName> = typeof import("./service_declarations").Services,
> extends ServiceRegistryBase {
  constructor(serviceMap: SMap, factories: import("./service_types").ModelServiceFactoryMap<SMap>) {
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
  SMap extends Record<string, ServiceName> = typeof import("./service_declarations").Services,
> extends ServiceRegistryBase {
  constructor(serviceMap: SMap, factories: import("./service_types").UiServiceFactoryMap<SMap>) {
    super("UiServiceRegistry", serviceMap, factories);
  }

  get<S extends ServiceTypesLike>(
    id: ServiceName<S>,
  ): ([unknown] extends [InferServiceUi<S>] ? Record<string, Function> : InferServiceUi<S>) | null;
  get(id: ServiceName): Record<string, Function> | null {
    return this.getById(id);
  }
}
