# Unified service provider

## API

### Defining services

```typescript
// sdk/model/src/services/defs.ts
// `import type` only — PFrame packages are devDependencies of sdk/model

const Services = {
  PFrameSpecV1: service<PFrameSpecDriver, PFrameSpecUiDriver>("pframeSpecV1"),
  PFrameSpecV2: service<PFrameSpecDriverV2, PFrameSpecUiDriverV2>("pframeSpecV2"),
  PFrameV1: service<PFrameModelDriver, PFrameDriver>("pframeV1"),
};
// Services.PFrameSpecV1 === "pframeSpecV1" (upper key for access, lower id for runtime)
```

### Block and plugin models

```typescript
// Block — declares required services
export const platforma = BlockModelV3.create(dataModel)
  .service(Services.PFrameSpecV1)
  .service(Services.PFrameV1)
  // ...
  .done();

// Plugin — declares its own services, accesses via ctx.services
const tablePlugin = PluginModel.define({ name, data })
  .service(Services.PFrameSpecV2)
  .output("table", (ctx) => {
    // ctx.services.pframeSpecV2 typed as PFrameSpecDriverV2
    // ctx.services.pframeV1 → compile error (not declared on this plugin)
    ctx.services.pframeSpecV2.createSpecFrame(...);
  })
  .build();
```

### App-side registration

```typescript
type ModelRegistryOptions = {
  env: MiddleLayerEnvironment;
};

type UiRegistryOptions = {
  serviceContext: BlockServiceContext;
};

// Model side — called from initDriverKit() in driver_kit.ts
function createModelRegistry(options: ModelRegistryOptions): ServiceRegistry {
  const { env } = options;
  return new ServiceRegistry()
    .register(Services.PFrameSpecV1, () => new SpecDriver())
    .register(Services.PFrameSpecV2, () => new SpecDriver())
    .register(Services.PFrameV1, () => createPFrameDriver(env));
}

// Ui side — called from initServices() in preload-block
function createUiRegistry(options: UiRegistryOptions): ServiceRegistry {
  const { serviceContext } = options;
  return new ServiceRegistry()
    .register(Services.PFrameSpecV1, () => new SpecDriver())
    .register(Services.PFrameSpecV2, () => new SpecDriver())
    .register(Services.PFrameV1, () => createPFrameDriverProxy(serviceContext));
}
```

## Implementation

### Service def

```typescript
// lib/model/common/src/services/defs.ts
// Follows the PluginHandle pattern: branded string + phantom interface + Infer* extractors.

import type { Branded } from "@milaboratories/helpers";

/**
 * Phantom-only base type for constraining ServiceId's type parameter.
 * Same role as PluginFactoryLike for PluginHandle.
 */
type ServiceTypesLike<Model = unknown, Ui = unknown> = {
  readonly __types?: { model: Model; ui: Ui };
};

/** Extract the Model interface from a ServiceTypesLike phantom. */
type InferServiceModel<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<infer M, unknown> ? M : unknown;

/** Extract the Ui interface from a ServiceTypesLike phantom. */
type InferServiceUi<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<unknown, infer U> ? U : unknown;

/**
 * Opaque handle for a service. Runtime value is the service name string.
 * Branded with ServiceTypesLike phantom for type-safe Model/Ui extraction.
 */
type ServiceId<S extends ServiceTypesLike = ServiceTypesLike> = Branded<string, S>;

const SERVICE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

/** Creates a branded ServiceId. Validates format — no colons, spaces, or empty strings.
 *  Colons are used as delimiters in VM function names ("service:{id}:{method}");
 *  an id containing ":" would cause dispatch collisions in callServiceMethod. */
function service<Model, Ui>(id: string): ServiceId<ServiceTypesLike<Model, Ui>> {
  if (!SERVICE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid service id "${id}": must match ${SERVICE_ID_PATTERN}`);
  }
  return id as ServiceId<ServiceTypesLike<Model, Ui>>;
}

// No defineServices() needed — Services is a plain const.
// Duplicate check happens in ServiceRegistry.register().
```

`Services.PFrameSpecV1` is the string `"pframeSpecV1"` branded
as `ServiceId<ServiceTypesLike<PFrameSpecDriver, PFrameSpecUiDriver>>`.
No `.id` property — the value is the id string itself.

The `Services` const lives in `sdk/model` (not
`lib/model/common`) to avoid pulling PFrame types into the
common package.

### ServiceRegistry

```typescript
// lib/model/common/src/services/registry.ts

class ServiceRegistry {
  private factories = new Map<string, () => unknown>();
  private instances = new Map<string, unknown>();

  /** Type-safe registration. Factory return type must match Model. */
  register<S extends ServiceTypesLike>(
    id: ServiceId<S>,
    factory: () => InferServiceModel<S>,
  ): this {
    if (this.factories.has(id)) throw new Error(`Service "${id}" already registered`);
    this.factories.set(id, factory);
    return this;
  }

  /** Typed when called with ServiceId, untyped when called with raw string. */
  get<S extends ServiceTypesLike>(id: ServiceId<S>): InferServiceModel<S>;
  get(id: string): unknown;
  get(id: string): unknown {
    if (!this.instances.has(id)) {
      const factory = this.factories.get(id);
      if (!factory) throw new ServiceNotRegisteredError(id);
      this.instances.set(id, factory());
    }
    return this.instances.get(id);
  }
}
```

### Declaring requirements on BlockModelV3

```typescript
// sdk/model/src/block_model.ts
// Follows the same overload + implementation pattern as .plugin()

// Typed overload — captures literal Id and ServiceTypesLike brand
public service<const Id extends string, S extends ServiceTypesLike>(
  id: ServiceId<S> & Id,
): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Services & Record<Id, InferServiceModel<S>>>;
// Implementation — deduplicates if same service declared twice
public service(id: ServiceId): BlockModelV3 {
  if (this.config.requiredServices.includes(id)) return this as BlockModelV3;
  return new BlockModelV3({
    ...this.config,
    requiredServices: [...this.config.requiredServices, id],
  });
}

// requiredServices stored on BlockConfigV4Generic (block_config.ts),
// NOT inside featureFlags (type assertions prevent adding string[]).
// Emitted in .done() alongside featureFlags, code, etc.
```

The same pattern on `PluginModelBuilder` — the 6th generic
`RequiredServices` is threaded through `.output()` callbacks:

```typescript
// sdk/model/src/plugin_model.ts

// Typed overload
public service<const Id extends string, S extends ServiceTypesLike>(
  id: ServiceId<S> & Id,
): PluginModelBuilder<Data, Params, Outputs, Config, Versions, RequiredServices & Record<Id, InferServiceModel<S>>>;
// Implementation — deduplicates if same service declared twice
public service(id: ServiceId): PluginModelBuilder {
  if (this.requiredServices.includes(id as string)) return this;
  return new PluginModelBuilder({
    ...this,
    requiredServices: [...this.requiredServices, id],
  });
}

// .output() passes RequiredServices as S to the callback's ctx
output<const Key extends string, T>(
  key: Key,
  fn: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>, RequiredServices>) => T,
): PluginModelBuilder<Data, Params, Outputs & { [K in Key]: T }, Config, Versions, RequiredServices> {
  // ... existing implementation
}
```

Each plugin stores its own `requiredServices: string[]` in
`PluginModel`. In `BlockModelV3.done()`, each plugin's
`PluginRenderCtx` receives only the service ids that plugin
declared. The Proxy in `services` getter dispatches via
`callServiceMethod` — no resolved instances are passed (they
live on the host side, not in the VM).

```typescript
// Plugin service merge — in .plugin(), alongside featureFlags merge
this.config.requiredServices = [
  ...new Set([...this.config.requiredServices, ...(plugin.requiredServices ?? [])]),
];
```

### Config data path

```typescript
// 1. BlockConfigV4Generic (block_config.ts) — add field
type BlockConfigV4Generic = {
  // ... existing fields: code, sdkVersion, featureFlags, etc.
  requiredServices?: ServiceId[];
};

// 2. BlockCodeWithInfo (code.ts) — add field
type BlockCodeWithInfo = {
  readonly code: Code; // Code = { type: "plain", content: string }
  readonly sdkVersion: string;
  readonly featureFlags: BlockCodeFeatureFlags | undefined;
  readonly requiredServices?: ServiceId[]; // new
};

// 3. extractCodeWithInfo() — extract the new field
function extractCodeWithInfo(cfg: BlockConfigGeneric): BlockCodeWithInfo {
  return {
    code: cfg.code,
    sdkVersion: cfg.sdkVersion,
    featureFlags: cfg.featureFlags,
    requiredServices: "requiredServices" in cfg ? cfg.requiredServices : undefined,
  };
}

// 4. JsExecutionContext — thread requiredServices to ComputableContextHelper
// 5. ComputableContextHelper — accept requiredServices + ServiceRegistry in constructor
```

### VM injection — ServiceInjector pattern

Service instances live in Node.js. Plugin output lambdas run
inside QuickJS. Live objects cannot cross the boundary.
Each service method is registered in a host-side dispatch map
(`serviceFunctions`). Plugin code accesses them via
`callServiceMethod` — a single VM-exported function that routes
to the right host-side handler by service id + method name.

```typescript
// lib/node/pl-middle-layer/src/js_render/service_injectors.ts
// Each service registers its methods in the host-side dispatch map.
// Co-locates argument marshalling with the service.

type ServiceInjector = (
  registerFn: (name: string, fn: VmFunctionImplementation) => void,
  registry: ServiceRegistry,
  parent: JsExecutionContext,
) => void;

// Factory — returns an immutable map, no module-level mutable state
function createServiceInjectors(): ReadonlyMap<string, ServiceInjector> {
  const map = new Map<string, ServiceInjector>();

  map.set(Services.PFrameSpecV1, (registerFn, registry, parent) => {
  const driver = registry.get(Services.PFrameSpecV1);
  registerFn("service:pframeSpecV1:createSpecFrame", (specs) =>
    parent.exportSingleValue(driver.createSpecFrame(parent.importObjectViaJson(specs)), undefined),
  );
  registerFn("service:pframeSpecV1:discoverColumns", (handle, request) =>
    parent.exportObjectViaJson(
      driver.specFrameDiscoverColumns(
        parent.vm.getString(handle),
        parent.importObjectViaJson(request),
      ),
    ),
  );
  // ... remaining methods
  });

  // ... additional services registered here
  return map;
}
```

```typescript
// computable_context.ts — in injectCtx(), after existing feature flag checks

// Dynamic injection: only export methods for declared services.
// If any injector fails, the entire block load fails — no partial injection.
const registerFn = (name: string, fn: VmFunctionImplementation) => {
  serviceFunctions.set(name, fn);
};
const injectors = createServiceInjectors();
for (const serviceId of this.requiredServices) {
  const injector = injectors.get(serviceId);
  if (!injector) throw new Error(`No ServiceInjector for "${serviceId}"`);
  try {
    injector(registerFn, this.registry, this.parent);
  } catch (e) {
    throw new Error(`Failed to inject service "${serviceId}": ${e}`);
  }
}
// Legacy: when requiredServices is undefined (not []), inject SpecDriver
// unconditionally. [] means "V3 block, wants no services".
// (existing lines 926-979 stay as fallback for V1/V2 blocks)
```

### PluginRenderCtx — typed services access

`PluginRenderCtx` runs inside the VM. It builds `services` by
dispatching through `callServiceMethod`, which looks up the
host-side function registered by `ServiceInjector`.

```typescript
// sdk/model/src/render/api.ts

class PluginRenderCtx<F extends PluginFactoryLike, S = {}> extends RenderCtxBase {
  private _services?: S;

  constructor(
    handle: PluginHandle<F>,
    wrappedInputs: Record<string, () => unknown>,
    private readonly requiredServiceIds: string[],
  ) {
    super();
  }

  // Lazy. Each service becomes a proxy dispatching to VM-exported functions.
  get services(): S {
    if (!this._services) {
      const ctx = this.ctx;
      const result: Record<string, unknown> = {};
      for (const id of this.requiredServiceIds) {
        result[id] = new Proxy(
          {},
          {
            get:
              (_, method: string) =>
              (...args: unknown[]) => {
                if (!ctx.callServiceMethod) {
                  throw new Error(
                    `Service "${id}.${method}" called but callServiceMethod is not available. ` +
                      `Ensure the Desktop version supports services.`,
                  );
                }
                return ctx.callServiceMethod(id, method, ...args);
              },
          },
        );
      }
      this._services = Object.freeze(result) as S;
    }
    return this._services;
  }
}
```

```typescript
// sdk/model/src/render/internal.ts — add to GlobalCfgRenderCtxMethods

// Dispatches to "service:{serviceId}:{methodName}" function exported by ServiceInjector
callServiceMethod?(serviceId: string, methodName: string, ...args: unknown[]): unknown;
```

```typescript
// computable_context.ts — host-side dispatch map + callServiceMethod

// In injectCtx() — serviceFunctions is local, captured by callServiceMethod closure
const serviceFunctions = new Map<string, VmFunctionImplementation>();

exportCtxFunction("callServiceMethod", (serviceIdHandle, methodHandle, ...argHandles) => {
  const serviceId = parent.vm.getString(serviceIdHandle);
  const method = parent.vm.getString(methodHandle);
  const fnName = `service:${serviceId}:${method}`;
  const fn = serviceFunctions.get(fnName);
  if (!fn) throw new ServiceMethodNotFoundError(serviceId, method);
  return fn(...argHandles);
});
```

Call flow: `ctx.services.pframeSpecV2.createSpecFrame(...)` →
Proxy → `callServiceMethod("pframeSpecV2", "createSpecFrame", ...)`
→ looks up `"service:pframeSpecV2:createSpecFrame"` → calls the
host-side function exported by `ServiceInjector`.

### Model-side provision

```typescript
// block_model.ts — in .done(), pass per-plugin service ids to PluginRenderCtx
const pluginServiceIds = plugin.requiredServices ?? [];
outputFn(new PluginRenderCtx(handle, wrappedInputs, pluginServiceIds));
```

### Ui-side provision

Two injection paths on the Ui side:

- **WASM services:** Ui registry factory creates a direct WASM
  instance in the renderer. Calls are synchronous.
- **Node services:** Ui registry factory creates an IPC proxy.
  Calls are async (routed to main process via service router).

Both paths: preload → contextBridge →
`globalThis.platforma.services` → Vue components.

```typescript
// 1. sdk/model/src/platforma.ts — add services to the interface
//    Optional for backward compat (old desktop apps don't populate it)
export type PlatformaV3<...> = BlockApiV3<...> & DriverKit & {
  readonly sdkInfo: SdkInfo;
  readonly apiVersion: 3;
  readonly __pluginsBrand?: Plugins;
  readonly services?: Record<string, unknown>; // NEW
};
```

Service IPC is handled by `BlockServiceContext.createProxyCall()`
directly — no generic `ipc.serviceCall()` needed. Channel names
follow `service:call:{serviceId}:{method}` (matching router).

```typescript
// 3. packages/preload-block/src/services/init_services.ts
//    Resolves each service from the Ui registry — returns either
//    a direct WASM instance (sync) or an IPC proxy (async).
function initServices(
  serviceIds: string[],
  uiRegistry: ServiceRegistry,
  serviceContext: BlockServiceContext,
): Record<string, unknown> {
  const factories: Record<string, () => unknown> = {};
  for (const id of serviceIds) {
    factories[id] = () => uiRegistry.get(id); // WASM instance or IPC proxy
  }
  return lazyMap(factories, () => serviceContext.isDisposed);
}
```

The Ui registry determines which path each service takes.
Block code uses the same `platforma.services.xxx` access for
both — sync vs async depends on the service type.

```typescript
// 4. packages/preload-block/src/v3-preload.ts — THE KEY WIRING POINT
//    Services are set on the same object that contextBridge exposes
export function v3(blockParams: BlockParamsWithApi): PlatformaV3 {
  const { blobDriver, logDriver, lsDriver, pFrameDriver } = initDrivers(blockParams);

  const serviceContext = new BlockServiceContext();
  const uiRegistry = createUiRegistry({ serviceContext });
  const services = initServices(blockParams.requiredServices ?? [], uiRegistry, serviceContext);

  ipc.on("block:dispose", () => serviceContext.dispose());

  return {
    apiVersion: 3,
    sdkInfo: CurrentSdkInfo,
    // ... existing API methods ...
    blobDriver,
    logDriver,
    lsDriver,
    pFrameDriver,
    services, // ← attached here, exposed via contextBridge
  };
}
```

```typescript
// 5. packages/preload-block/src/platforma.ts — already does this:
contextBridge.exposeInMainWorld("platforma", platforma);
// services is now on the platforma object, accessible as globalThis.platforma.services
```

```typescript
// 6. Vue component access — same pattern as existing pFrameDriver access
import { getRawPlatformaInstance } from "@platforma-sdk/model";

const services = getRawPlatformaInstance().services;
await services.pframeV1.findColumns(handle, request);
```

Service ids reach the preload via `blockParams.requiredServices`
(added to `BlockParamsWithApi`). The list is small (single-digit
service count, short camelCase ids) — URL query params are safe.

`lazyMap` is a non-exported helper inlined in `init_services.ts`:

```typescript
// Proxy-based lazy instantiation — 2 traps, dispose-aware
function lazyMap(
  factories: Record<string, () => unknown>,
  isDisposed: () => boolean,
): Record<string, unknown> {
  const cache = new Map<string, unknown>();
  return new Proxy({} as Record<string, unknown>, {
    get(_target, key: PropertyKey) {
      if (typeof key !== "string") return undefined;
      if (isDisposed()) throw new ServiceCallAbortedError(key, "access");
      if (!cache.has(key)) {
        const factory = factories[key];
        if (!factory) return undefined;
        cache.set(key, factory());
      }
      return cache.get(key);
    },
    has(_target, key: PropertyKey) {
      return typeof key === "string" && key in factories;
    },
  });
}
```

Accessed by known typed keys, not iterated or spread. Cached
instances freed when block Ui is destroyed.

### Service router

```typescript
// platforma-desktop-app/packages/main/src/ipc/serviceRouter.ts
// One IPC channel per (service, method) — matches createRouter pattern

type ServiceRoute<T> = {
  instance: T;
  methods: (keyof T & string)[]; // compile-time checked against instance type
};

function createServiceRouter(routes: Record<string, ServiceRoute<unknown>>) {
  for (const [serviceId, route] of Object.entries(routes)) {
    for (const method of route.methods) {
      ipcMain.handle(`service:call:${serviceId}:${method}`, async (_event, ...args) => {
        const fn = (route.instance as Record<string, Function>)[method];
        // wrapResult/unwrapResult: existing ResultOrError<T> envelope
        // from base/createRouter.ts
        return wrapResult(await fn.apply(route.instance, args));
      });
    }
  }
}

// Usage
createServiceRouter({
  [Services.PFrameV1]: {
    instance: pframeDriver as PFrameDriver,
    methods: [
      "findColumns",
      "getColumnSpec",
      "listColumns",
      "calculateTableData",
      "getUniqueValues",
      "getShape",
      "getSpec",
      "getData",
    ],
  },
});
```

If a Ui-side proxy is registered for a service with no
model-side counterpart, no IPC channels exist — calls fail
immediately.

### Handling missing services

```typescript
// lib/model/common/src/services/deprecated.ts

// Transition period: V2 shipped but V1 not yet removed
const SupersededServices: Record<string, string> = {
  pframeSpecV1: "pframeSpecV2", // service still works, block gets warning
};

// Fully removed from registry
const DeprecatedServices: Record<string, string> = {
  pframeSpecV0: "Removed in Desktop 2.5.",
};
```

| Status     | Condition                  | Behavior                                                                                                                      |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Available  | Registry has a factory     | Block loads normally.                                                                                                         |
| Superseded | Id in `SupersededServices` | Block loads normally. Informational warning.                                                                                  |
| Deprecated | Id in `DeprecatedServices` | Block does not load. Error: "Block `{name}` requires `{id}` which is no longer supported."                                    |
| Unknown    | Id not in any list         | Block does not load. Error: "Block `{name}` requires `{id}` which is not recognized. Check the service id or update Desktop." |

### BlockServiceContext — eviction and in-flight calls

```typescript
// preload-block/src/services/block_service_context.ts
// Checks disposed flag before and after each IPC call.
// The IPC call itself cannot be cancelled — only the promise resolution.

class BlockServiceContext implements Disposable {
  private disposed = false;

  createProxyCall(serviceId: string, method: string) {
    return async (...args: unknown[]): Promise<unknown> => {
      if (this.disposed) throw new ServiceCallAbortedError(serviceId, method);
      const result = await ipcRenderer.invoke(`service:call:${serviceId}:${method}`, ...args);
      if (this.disposed) throw new ServiceCallAbortedError(serviceId, method);
      return unwrapResult(result);
    };
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.disposed = true;
  }
  [Symbol.dispose](): void {
    this.dispose();
  }
}

// Hand-written proxy factory — method names checked at compile time
function createPFrameDriverProxy(ctx: BlockServiceContext): PFrameDriver {
  const call = <M extends keyof PFrameDriver & string>(method: M) =>
    ctx.createProxyCall(Services.PFrameV1, method);
  return {
    findColumns: call("findColumns"),
    getColumnSpec: call("getColumnSpec"),
    listColumns: call("listColumns"),
    calculateTableData: call("calculateTableData"),
    getUniqueValues: call("getUniqueValues"),
    getShape: call("getShape"),
    getSpec: call("getSpec"),
    getData: call("getData"),
  } as PFrameDriver;
}
```

```typescript
// lib/model/common/src/services/errors.ts

export class ServiceCallAbortedError extends Error {
  name = "ServiceCallAbortedError";
  constructor(
    readonly serviceId: string,
    readonly method: string,
  ) {
    super(`Service call aborted: ${serviceId}.${method}`);
  }
}

export class ServiceNotRegisteredError extends Error {
  name = "ServiceNotRegisteredError";
  constructor(readonly serviceId: string) {
    super(`Service not registered: ${serviceId}`);
  }
}

export class ServiceMethodNotFoundError extends Error {
  name = "ServiceMethodNotFoundError";
  constructor(
    readonly serviceId: string,
    readonly method: string,
  ) {
    super(`Method "${method}" not found on service "${serviceId}"`);
  }
}
```

```typescript
// Teardown — main/src/windows.ts eviction callback
// block:dispose MUST precede removeAllListeners()
blockView.webContents.send("block:dispose");
blockView.webContents.removeAllListeners();

// preload-block/src/index.ts — via @platforma/ipc
ipc.on("block:dispose", () => {
  blockServiceContext.dispose();
});
```

Model-side instances are shared (app lifetime). Renderer-side
instances are freed with the block Ui heap. Lazy services that
were never accessed have no instance to leak.

### Lifecycle

```text
1. App starts
   └─ Model registry created with all service factories
   └─ Service router registers IPC channels

2. Block loaded
   └─ Block config contains requiredServices: ["pframeSpecV1", "pframeV1"]
   └─ Plugin services auto-merged via .plugin() (set union, deduped)

3. Compatibility check
   └─ available → proceed, superseded → warn,
      deprecated → error "update block", unknown → error "check id / update Desktop"

4. Model context created
   └─ Services resolved from model registry (singleton per id)
   └─ Each method registered in host-side dispatch map (serviceFunctions)

5. Ui loaded
   └─ Service ids from blockParams.requiredServices
   └─ v3-preload.ts creates BlockServiceContext + initServices()
   └─ Attached to platforma object → contextBridge → globalThis.platforma.services
   └─ Lazy: instances created on first property access
```

## Migration path

1. **Immediate:** Delegate existing SpecDriver methods from
   `PluginRenderCtx` (infrastructure already in
   `GlobalCfgRenderCtx`).
2. **Service registry:** `ServiceId`, `defineServices`,
   `ServiceRegistry`, `.service()` on builders.
   `requiredServices` on block config. Extend
   `extractCodeWithInfo()` and `ComputableContextHelper`.
   Migrate `PFrameSpecDriver` first.
3. **PFrameDriver:** Into registry. Hand-written remote proxy.
   Service router. Remove from unconditional `DriverKit`.
4. **Table plugin:**
   `.service(Services.PFrameSpecV1).service(Services.PFrameV1)`.

## Changes by file

### platforma

| File                                                                | Change                                                                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `lib/model/common/src/services/defs.ts` (new)                       | `ServiceId`, `ServiceTypesLike`, `InferServiceModel`, `InferServiceUi`, `service()`                             |
| `lib/model/common/src/services/deprecated.ts` (new)                 | `SupersededServices`, `DeprecatedServices`                                                                      |
| `lib/model/common/src/services/registry.ts` (new)                   | `ServiceRegistry`                                                                                               |
| `lib/model/common/src/services/errors.ts` (new)                     | `ServiceCallAbortedError`, `ServiceNotRegisteredError`, `ServiceMethodNotFoundError`                            |
| `sdk/model/src/services/defs.ts` (new)                              | `Services` const                                                                                                |
| `lib/model/common/src/bmodel/block_config.ts`                       | `requiredServices?: ServiceId[]` on `BlockConfigV4Generic`                                                      |
| `lib/model/common/src/flags/flag_utils.ts`                          | `RuntimeCapabilities.checkServiceCompatibility()`                                                               |
| `lib/model/common/src/driver_kit.ts`                                | Remove `pFrameDriver` (phase 3)                                                                                 |
| `sdk/model/src/block_model.ts`                                      | `.service()`, merge in `.plugin()`, emit in `.done()`, pass per-plugin service ids to `PluginRenderCtx`         |
| `sdk/model/src/plugin_model.ts`                                     | `.service()` with 6th generic `RequiredServices`. Thread through `.output()`/`.outputWithStatus()`.             |
| `sdk/model/src/render/api.ts`                                       | Add `S` generic + lazy `services` getter with Proxy dispatch to `PluginRenderCtx`                               |
| `sdk/model/src/render/internal.ts`                                  | `callServiceMethod()` on `GlobalCfgRenderCtxMethods`                                                            |
| `lib/node/pl-middle-layer/src/js_render/service_injectors.ts` (new) | `ServiceInjector` type + `createServiceInjectors()` factory                                                     |
| `lib/node/pl-middle-layer/src/js_render/computable_context.ts`      | Accept `requiredServices` + `ServiceRegistry`. Export `callServiceMethod`. Conditional injection via injectors. |
| `lib/node/pl-middle-layer/src/js_render/context.ts`                 | Thread `requiredServices` from `BlockCodeWithInfo` to `ComputableContextHelper`                                 |
| `lib/node/pl-middle-layer/src/cfg_render/code.ts`                   | Add `requiredServices` to `BlockCodeWithInfo`, extract in `extractCodeWithInfo()`                               |
| `lib/node/pl-middle-layer/src/middle_layer/driver_kit.ts`           | Create model `ServiceRegistry`                                                                                  |
| `sdk/model/src/platforma.ts`                                        | `services` on `PlatformaV3`                                                                                     |

### platforma-desktop-app

| File                                                                 | Change                                                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `packages/preload-block/src/services/block_service_context.ts` (new) | `BlockServiceContext` with dispose guard, IPC via `ipcRenderer.invoke` directly                    |
| `packages/preload-block/src/services/init_services.ts` (new)         | `initServices()` + inlined `lazyMap` helper — resolves from Ui registry                            |
| `packages/preload-block/src/v3-preload.ts`                           | Create `BlockServiceContext`, `createUiRegistry`, `initServices()`, attach `services` to platforma |
| `packages/preload-block/src/platforma.ts`                            | Add `requiredServices` to `BlockParamsWithApi` parsing                                             |
| `packages/main/src/ipc/serviceRouter.ts` (new)                       | `createServiceRouter()` — reuse `createRouter` with service namespace prefix                       |
| `packages/main/src/tasks/LoadBlockFrontend.ts`                       | Pass `requiredServices` in blockParams URL query                                                   |
| `packages/worker/src/workerApi.ts`                                   | Model `ServiceRegistry` in `MiddleLayer.init()`                                                    |
| `packages/core/src/types/validation.ts`                              | Add `requiredServices` to `BlockParamsWithApi` schema                                              |

## Backward compatibility

```text
requiresModelAPIVersion < N (V1/V2 blocks):
  └─ No requiredServices in config
  └─ Full DriverKit injected unconditionally (legacy path)

requiresModelAPIVersion >= N (V3+ blocks):
  └─ Reads requiredServices from config
  └─ Only declared services are injected
  └─ pFrameDriver not available unless .service(Services.PFrameV1)
```

N = the model API version introducing service support
(determined during implementation). `DriverKit` remains as the
legacy path — no breaking changes to V1/V2 blocks.

## Testing

```text
Model registry    → plain Node.js, MiddleLayer test harness
Ui registry       → vitest, pure TypeScript (no Electron)
WASM instantiation → vitest (same as pf-spec-driver tests)
Remote proxies    → e2e harness (vitest.e2e.config.js) or mock IPC
Integration       → register services, load block, verify platforma.services
```
