# Unified service provider

## API

### Defining services

```typescript
// lib/model/common/src/services/defs.ts

type ServiceTypesLike<Model = unknown, Ui = unknown> = {
  readonly __types?: { model: Model; ui: Ui };
};
type InferServiceModel<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<infer M, unknown> ? M : unknown;
type InferServiceUi<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<unknown, infer U> ? U : unknown;
type ServiceId<S extends ServiceTypesLike = ServiceTypesLike> = Branded<string, S>;

const SERVICE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

function service<Model, Ui>(id: string): ServiceId<ServiceTypesLike<Model, Ui>> {
  if (!SERVICE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid service id "${id}": must match ${SERVICE_ID_PATTERN}`);
  }
  return id as ServiceId<ServiceTypesLike<Model, Ui>>;
}
```

```typescript
// sdk/model/src/services/defs.ts
// `import type` only — PFrame packages are devDependencies of sdk/model

const Services = {
  PFrameSpecV1: service<PFrameSpecDriver, PFrameSpecUiDriver>("pframeSpecV1"),
  PFrameSpecV2: service<PFrameSpecDriverV2, PFrameSpecUiDriverV2>("pframeSpecV2"),
  PFrameV1: service<PFrameModelDriver, PFrameDriver>("pframeV1"),
};
```

### Service requirements via feature flags

Block/plugin developers do not declare services. Feature flags
are hardcoded in SDK — each SDK version knows which services it
needs. The SDK sets the appropriate flags internally.

```typescript
// lib/model/common/src/flags/block_flags.ts
// Boolean require flags added alongside existing numeric ones

type BlockCodeKnownFeatureFlags = {
  readonly supportsLazyState?: boolean;
  readonly supportsPframeQueryRanking?: boolean;
  readonly requiresModelAPIVersion?: number;
  readonly requiresUIAPIVersion?: number;
  readonly requiresCreatePTable?: number;
  // NEW — boolean require flags for services
  readonly requiresPFrameSpecV1?: boolean;
  readonly requiresPFrameSpecV2?: boolean;
  readonly requiresPFrameV1?: boolean;
};
```

`BlockCodeFeatureFlags` already allows `boolean | number` on
`requires*` keys — no base type change needed.

```typescript
// sdk/model/src/block_model.ts — flags hardcoded in SDK, not set by devs
static readonly INITIAL_BLOCK_FEATURE_FLAGS: BlockCodeKnownFeatureFlags = {
  supportsLazyState: true,
  supportsPframeQueryRanking: true,
  requiresUIAPIVersion: 3,
  requiresModelAPIVersion: BLOCK_STORAGE_FACADE_VERSION,
  requiresCreatePTable: 2,
  // SDK v3 always requires PFrameSpecV1
  requiresPFrameSpecV1: true,
};
```

```typescript
// A plugin built with newer SDK might set additional flags
// These merge via mergeFeatureFlags() — boolean OR, numeric MAX
PluginModel.define({
  name,
  data,
  featureFlags: { requiresPFrameSpecV2: true },
});
```

### Model-side access

```typescript
// Plugin output lambda — services injected based on merged flags
.output("table", (ctx) => {
  // ctx.services.pframeSpecV2 typed as PFrameSpecDriverV2
  ctx.services.pframeSpecV2.createSpecFrame(...);
})
```

### Ui-side access

```typescript
// Block-level services — on the app object, like plugins
const app = useApp();
await app.services.pframeV1.findColumns(handle, request);
app.services.pframeSpecV1.createSpecFrame(specs); // sync WASM

// Plugin-level services — on the plugin object from usePlugin()
const plugin = usePlugin(props.handle);
plugin.services.pframeSpecV2.createSpecFrame(specs);
```

`app.services` contains services from the block's merged flags
(block + all plugins). `plugin.services` contains services from
that plugin's own flags — scoped to what the plugin declared.

On the model side, `PluginRenderCtx` receives the merged flags
(block + this plugin) so it can access both block-level and
plugin-level services. This is intentional — plugins use
block-level services (e.g. pframeSpecV1) alongside their own.

### App-side registration

```typescript
// Model side — called from initDriverKit() in driver_kit.ts
function createModelRegistry(options: ModelRegistryOptions): ServiceRegistry {
  const { env } = options;
  return new ServiceRegistry()
    .register(Services.PFrameSpecV1, () => new SpecDriver())
    .register(Services.PFrameSpecV2, () => new SpecDriver())
    .register(Services.PFrameV1, () => createPFrameDriver(env));
}

// Ui side — called from v3-preload.ts
function createUiRegistry(options: UiRegistryOptions): ServiceRegistry {
  const { serviceContext } = options;
  return new ServiceRegistry()
    .register(Services.PFrameSpecV1, () => new SpecDriver())
    .register(Services.PFrameSpecV2, () => new SpecDriver())
    .register(Services.PFrameV1, () => createPFrameDriverProxy(serviceContext));
}
```

## Implementation

### ServiceRegistry

```typescript
// lib/model/common/src/services/registry.ts

class ServiceRegistry {
  private factories = new Map<string, () => unknown>();
  private instances = new Map<string, unknown>();

  register<S extends ServiceTypesLike>(
    id: ServiceId<S>,
    factory: () => InferServiceModel<S>,
  ): this {
    if (this.factories.has(id)) throw new Error(`Service "${id}" already registered`);
    this.factories.set(id, factory);
    return this;
  }

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

### Resolving required services from feature flags

```typescript
// lib/model/common/src/services/flag_mapping.ts
// Maps boolean require flags to ServiceId values

const SERVICE_FLAG_MAP: Record<string, ServiceId> = {
  requiresPFrameSpecV1: Services.PFrameSpecV1,
  requiresPFrameSpecV2: Services.PFrameSpecV2,
  requiresPFrameV1: Services.PFrameV1,
};

function resolveRequiredServices(flags: BlockCodeKnownFeatureFlags | undefined): string[] {
  if (!flags) return [];
  return Object.entries(SERVICE_FLAG_MAP)
    .filter(([flag]) => flags[flag as keyof BlockCodeKnownFeatureFlags] === true)
    .map(([, serviceId]) => serviceId as string);
}
```

No `requiredServices` array on the block config — flags are
the source of truth.

### Config data path

```text
BlockModelV3.done()
  └─ Emits featureFlags (including requiresPFrameSpecV1: true etc.)
       └─ Serialized into BlockConfigContainer
            └─ Stored in block pack

Middle layer reads config:
  extractCodeWithInfo()
    └─ Extracts featureFlags (unchanged)
         └─ ComputableContextHelper receives featureFlags
              └─ resolveRequiredServices(featureFlags) → service id list
              └─ Inject only those services into VM
```

### VM injection — ServiceInjector pattern

Service instances live in Node.js. Plugin output lambdas run
inside QuickJS. Live objects cannot cross the boundary.
Each service method is registered in a host-side dispatch map.
Plugin code accesses them via `callServiceMethod`.

```typescript
// lib/node/pl-middle-layer/src/js_render/service_injectors.ts

type ServiceInjector = (
  registerFn: (name: string, fn: VmFunctionImplementation) => void,
  registry: ServiceRegistry,
  parent: JsExecutionContext,
) => void;

// Factory — returns immutable map, no module-level mutable state
function createServiceInjectors(): ReadonlyMap<string, ServiceInjector> {
  const map = new Map<string, ServiceInjector>();

  map.set(Services.PFrameSpecV1, (registerFn, registry, parent) => {
    const driver = registry.get(Services.PFrameSpecV1);
    registerFn("service:pframeSpecV1:createSpecFrame", (specs) =>
      parent.exportSingleValue(
        driver.createSpecFrame(parent.importObjectViaJson(specs)),
        undefined,
      ),
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

  // ... additional services
  return map;
}
```

```typescript
// computable_context.ts — in injectCtx()

const requiredServiceIds = resolveRequiredServices(this.featureFlags);
const serviceFunctions = new Map<string, VmFunctionImplementation>();
const registerFn = (name: string, fn: VmFunctionImplementation) => {
  serviceFunctions.set(name, fn);
};

// Dynamic injection based on feature flags
const injectors = createServiceInjectors();
for (const serviceId of requiredServiceIds) {
  const injector = injectors.get(serviceId);
  if (!injector) throw new Error(`No ServiceInjector for "${serviceId}"`);
  try {
    injector(registerFn, this.registry, this.parent);
  } catch (e) {
    throw new Error(`Failed to inject service "${serviceId}": ${e}`);
  }
}
// [] means no services (valid). undefined featureFlags = legacy block,
// inject SpecDriver unconditionally (existing lines 926-979).

exportCtxFunction("callServiceMethod", (serviceIdHandle, methodHandle, ...argHandles) => {
  const serviceId = parent.vm.getString(serviceIdHandle);
  const method = parent.vm.getString(methodHandle);
  const fnName = `service:${serviceId}:${method}`;
  const fn = serviceFunctions.get(fnName);
  if (!fn) throw new ServiceMethodNotFoundError(serviceId, method);
  return fn(...argHandles);
});
```

### PluginRenderCtx — typed services access

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
// sdk/model/src/render/internal.ts
callServiceMethod?(serviceId: string, methodName: string, ...args: unknown[]): unknown;
```

```typescript
// block_model.ts — in .done(), pass resolved service ids to PluginRenderCtx
const pluginServiceIds = resolveRequiredServices(
  mergeFeatureFlags(this.config.featureFlags, plugin.featureFlags ?? {}),
);
outputFn(new PluginRenderCtx(handle, wrappedInputs, pluginServiceIds));
```

### Ui-side provision

Two injection paths:

- **WASM services:** Direct instance in renderer. Sync calls.
- **Node services:** IPC proxy. Async calls.

```typescript
// 1. sdk/model/src/platforma.ts — add services to the interface
export type PlatformaV3<...> = BlockApiV3<...> & DriverKit & {
  readonly sdkInfo: SdkInfo;
  readonly apiVersion: 3;
  readonly __pluginsBrand?: Plugins;
  readonly services?: Record<string, unknown>;
};
```

```typescript
// 2. packages/preload-block/src/services/init_services.ts
function initServices(
  serviceIds: string[],
  uiRegistry: ServiceRegistry,
  serviceContext: BlockServiceContext,
): Record<string, unknown> {
  const factories: Record<string, () => unknown> = {};
  for (const id of serviceIds) {
    factories[id] = () => uiRegistry.get(id);
  }
  return lazyMap(factories, () => serviceContext.isDisposed);
}

// lazyMap — non-exported helper, Proxy-based lazy instantiation
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

```typescript
// 3. packages/preload-block/src/v3-preload.ts
export function v3(blockParams: BlockParamsWithApi): PlatformaV3 {
  const { blobDriver, logDriver, lsDriver, pFrameDriver } = initDrivers(blockParams);

  // blockParams only has projectId, blockId, apiVersion — no flags.
  // Fetch flags from the worker via dedicated IPC before initializing services.
  const featureFlags = await ipc.v3("getFeatureFlags", blockParams);
  const serviceIds = resolveRequiredServices(featureFlags);
  const serviceContext = new BlockServiceContext();
  const uiRegistry = createUiRegistry({ serviceContext });
  const services = initServices(serviceIds, uiRegistry, serviceContext);

  ipc.on("block:dispose", () => serviceContext.dispose());

  return {
    apiVersion: 3,
    sdkInfo: CurrentSdkInfo,
    // ... existing API methods ...
    blobDriver,
    logDriver,
    lsDriver,
    pFrameDriver,
    services,
  };
}
```

```typescript
// sdk/ui-vue/src/internal/createAppV3.ts
const app = {
  // ... existing model, outputs, outputErrors ...
  plugins,
  services: markRaw(platforma.services ?? {}),
};
```

`markRaw` prevents Vue from double-wrapping the Proxy-based
`lazyMap`.

```typescript
// sdk/model/src/platforma.ts — extend BlockModelInfo
type BlockModelInfo = {
  outputs: ...;
  pluginIds: string[];
  featureFlags: BlockCodeKnownFeatureFlags;
  pluginFeatureFlags: Record<string, BlockCodeKnownFeatureFlags>;
};
```

```typescript
// sdk/model/src/block_model.ts — populate pluginFeatureFlags in .done()
blockModelInfo: {
  // ... existing
  pluginFeatureFlags: Object.fromEntries(
    Object.entries(this.config.plugins).map(([id, p]) => [id, p.model.featureFlags ?? {}]),
  ),
},
```

```typescript
// sdk/ui-vue/src/usePlugin.ts — scoped to plugin's own flags
function createPluginState(handle) {
  const pluginFlags = platforma.blockModelInfo.pluginFeatureFlags[handle] ?? {};
  const pluginServiceIds = resolveRequiredServices(pluginFlags);
  const pluginServices: Record<string, unknown> = {};
  for (const id of pluginServiceIds) {
    pluginServices[id] = platforma.services?.[id];
  }
  return {
    // ... existing data, outputs, outputErrors ...
    services: markRaw(Object.freeze(pluginServices)),
  };
}
```

```typescript
// Vue component access
const app = useApp();
await app.services.pframeV1.findColumns(handle, request);
app.services.pframeSpecV1.createSpecFrame(specs); // sync WASM
```

### Service router

```typescript
// platforma-desktop-app/packages/main/src/ipc/serviceRouter.ts

type ServiceRoute<T> = {
  instance: T;
  methods: (keyof T & string)[];
};

function createServiceRouter(routes: Record<string, ServiceRoute<unknown>>) {
  for (const [serviceId, route] of Object.entries(routes)) {
    for (const method of route.methods) {
      ipcMain.handle(`service:call:${serviceId}:${method}`, async (_event, ...args) => {
        const fn = (route.instance as Record<string, Function>)[method];
        return wrapResult(await fn.apply(route.instance, args));
      });
    }
  }
}

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

### Handling missing services

```typescript
// lib/model/common/src/services/deprecated.ts

const SupersededServices: Record<string, string> = {
  pframeSpecV1: "pframeSpecV2",
};
const DeprecatedServices: Record<string, string> = {
  pframeSpecV0: "Removed in Desktop 2.5.",
};
```

| Status     | Condition                  | Behavior                                                        |
| ---------- | -------------------------- | --------------------------------------------------------------- |
| Available  | Registry has a factory     | Block loads normally.                                           |
| Superseded | Id in `SupersededServices` | Block loads normally. Informational warning.                    |
| Deprecated | Id in `DeprecatedServices` | Block does not load. Error naming the block and service.        |
| Unknown    | Id not in any list         | Block does not load. Error: check service id or update Desktop. |

### BlockServiceContext — eviction and in-flight calls

```typescript
// preload-block/src/services/block_service_context.ts

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

// Hand-written proxy — method names checked at compile time
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
// Teardown — main/src/windows.ts
blockView.webContents.send("block:dispose"); // must precede removeAllListeners()
blockView.webContents.removeAllListeners();

// preload-block/src/index.ts
ipc.on("block:dispose", () => {
  blockServiceContext.dispose();
});
```

### Lifecycle

```text
1. App starts
   └─ Model registry + Ui registry created with all service factories
   └─ Service router registers IPC channels

2. Block loaded
   └─ Block config contains featureFlags: { requiresPFrameSpecV1: true, ... }
   └─ Plugin flags merged via mergeFeatureFlags() (boolean OR)

3. Compatibility check (RuntimeCapabilities)
   └─ Boolean require flags checked: true = required, registry must have it
   └─ available → proceed, deprecated → error, unknown → error

4. Model context created
   └─ resolveRequiredServices(featureFlags) → service id list
   └─ ServiceInjectors register methods in host-side dispatch map
   └─ callServiceMethod exported to VM

5. Ui loaded
   └─ resolveRequiredServices(featureFlags) → same list
   └─ initServices() creates lazyMap from Ui registry
   └─ Attached to platforma.services → createAppV3 → app.services
```

## Migration path

1. **Immediate:** Delegate existing SpecDriver methods from
   `PluginRenderCtx` (infrastructure already in
   `GlobalCfgRenderCtx`).
2. **Boolean require flags:** Add boolean `requires*` support to
   `RuntimeCapabilities`. Add service flags to
   `BlockCodeKnownFeatureFlags`. Set initial flags in
   `BlockModelV3.INITIAL_BLOCK_FEATURE_FLAGS`. Add
   `resolveRequiredServices()` + `SERVICE_FLAG_MAP`.
3. **Model-side services:** `ServiceRegistry`,
   `createServiceInjectors`, `callServiceMethod` in
   `ComputableContextHelper`. `services` property on
   `PluginRenderCtx`.
4. **Ui-side services:** `BlockServiceContext`,
   `initServices`, `lazyMap` in preload. `services` on
   `PlatformaV3`. `app.services` in `createAppV3`.
5. **PFrameDriver:** Into registry. Hand-written remote proxy.
   Service router. Remove from unconditional `DriverKit`.
6. **Table plugin:** Uses `app.services.pframeSpecV1` and
   `app.services.pframeV1` — flags set by SDK automatically.

## Changes by file

### platforma

| File                                                                | Change                                                                                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/model/common/src/services/defs.ts` (new)                       | `ServiceId`, `ServiceTypesLike`, `InferServiceModel`, `InferServiceUi`, `service()`                                                             |
| `lib/model/common/src/services/flag_mapping.ts` (new)               | `SERVICE_FLAG_MAP`, `resolveRequiredServices()`                                                                                                 |
| `lib/model/common/src/services/deprecated.ts` (new)                 | `SupersededServices`, `DeprecatedServices`                                                                                                      |
| `lib/model/common/src/services/registry.ts` (new)                   | `ServiceRegistry`                                                                                                                               |
| `lib/model/common/src/services/errors.ts` (new)                     | `ServiceCallAbortedError`, `ServiceNotRegisteredError`, `ServiceMethodNotFoundError`                                                            |
| `sdk/model/src/services/defs.ts` (new)                              | `Services` const                                                                                                                                |
| `lib/model/common/src/flags/block_flags.ts`                         | Add boolean `requiresPFrameSpecV1`, `requiresPFrameSpecV2`, `requiresPFrameV1` to type AND `AllRequiresFeatureFlags` array                      |
| `lib/model/common/src/flags/flag_utils.ts`                          | `RuntimeCapabilities` — support boolean require flags + service compatibility check                                                             |
| `lib/model/common/src/driver_kit.ts`                                | Remove `pFrameDriver` (phase 5)                                                                                                                 |
| `sdk/model/src/block_model.ts`                                      | Set service flags in `INITIAL_BLOCK_FEATURE_FLAGS`. Pass resolved service ids to `PluginRenderCtx`. Populate `pluginFeatureFlags` in `.done()`. |
| `sdk/model/src/render/api.ts`                                       | Add `S` generic + `services` getter with Proxy dispatch to `PluginRenderCtx`                                                                    |
| `sdk/model/src/render/internal.ts`                                  | `callServiceMethod()` on `GlobalCfgRenderCtxMethods`                                                                                            |
| `lib/node/pl-middle-layer/src/js_render/service_injectors.ts` (new) | `ServiceInjector` type + `createServiceInjectors()` factory                                                                                     |
| `lib/node/pl-middle-layer/src/js_render/computable_context.ts`      | `resolveRequiredServices()`, conditional injection via injectors, `callServiceMethod`                                                           |
| `lib/node/pl-middle-layer/src/middle_layer/driver_kit.ts`           | Create model `ServiceRegistry`                                                                                                                  |
| `sdk/model/src/platforma.ts`                                        | `services` on `PlatformaV3`. `pluginFeatureFlags` on `BlockModelInfo`.                                                                          |
| `sdk/ui-vue/src/internal/createAppV3.ts`                            | `markRaw(platforma.services)` on app object                                                                                                     |
| `sdk/ui-vue/src/usePlugin.ts`                                       | `markRaw(services)` on plugin state — scoped via `pluginFeatureFlags[handle]`                                                                   |

### platforma-desktop-app

| File                                                                 | Change                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/preload-block/src/services/block_service_context.ts` (new) | `BlockServiceContext` with dispose guard                                                        |
| `packages/preload-block/src/services/init_services.ts` (new)         | `initServices()` + inlined `lazyMap`                                                            |
| `packages/preload-block/src/v3-preload.ts`                           | `resolveRequiredServices`, `createUiRegistry`, `initServices()`, attach `services` to platforma |
| `packages/main/src/ipc/serviceRouter.ts` (new)                       | `createServiceRouter()` with typed method lists                                                 |
| `packages/worker/src/workerApi.ts`                                   | Model `ServiceRegistry` in `MiddleLayer.init()`. `getFeatureFlags` IPC handler.                 |
| `packages/ipc/src/ipc.ts`                                            | Add `v3("getFeatureFlags", blockParams)` IPC call                                               |

## Backward compatibility

```text
featureFlags without service require flags (V1/V2/old V3 blocks):
  └─ resolveRequiredServices() returns []
  └─ No services injected via new system
  └─ Existing unconditional SpecDriver injection stays (legacy)

featureFlags with service require flags (new V3+ blocks):
  └─ resolveRequiredServices() returns the declared services
  └─ Only those services injected
  └─ pFrameDriver not available unless requiresPFrameV1: true
```

`DriverKit` remains as the legacy injection path — no breaking
changes to existing blocks.

## Testing

```text
Model registry    → plain Node.js, MiddleLayer test harness
Ui registry       → vitest, pure TypeScript (no Electron)
WASM instantiation → vitest (same as pf-spec-driver tests)
Remote proxies    → e2e harness (vitest.e2e.config.js) or mock IPC
Feature flags     → unit test resolveRequiredServices() with various flag combos
Integration       → register services, load block, verify app.services
```
