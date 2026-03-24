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
type ServiceId<S extends ServiceTypesLike = ServiceTypesLike> = Branded<string, S>;

const SERVICE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

// Host-side VM dispatch map key
function serviceFnKey(serviceId: string, method = ""): string {
  return `service:${serviceId}:${method}`;
}

// IPC channel name (Electron main ↔ renderer)
function serviceIpcChannel(serviceId: string, method: string): string {
  return `service:call:${serviceId}:${method}`;
}

function service<Model, Ui>(id: string): ServiceId<ServiceTypesLike<Model, Ui>> {
  if (!SERVICE_ID_PATTERN.test(id)) {
    throw new ServiceInvalidIdError(id);
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

// Derive requires* feature flags from Services keys automatically
// PFrameSpecV1 → requiresPFrameSpecV1?: boolean
type ServiceRequireFlags = {
  [K in keyof typeof Services as `requires${K & string}`]?: boolean;
};

// Map flag name back to Services entry: "requiresPFrameSpecV1" → typeof Services.PFrameSpecV1
type FlagToService<Flag extends string> = Flag extends `requires${infer K}`
  ? K extends keyof typeof Services
    ? (typeof Services)[K]
    : never
  : never;

type InferServiceUi<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<unknown, infer U> ? U : unknown;

// Extract the brand S from ServiceId<S>
type ServiceBrand<T> = T extends Branded<string, infer S extends ServiceTypesLike> ? S : never;

// Resolve typed services from feature flags
// { requiresPFrameSpecV1: true } → { pframeSpecV1: PFrameSpecDriver }
type ResolveModelServices<Flags> = UnionToIntersection<
  {
    [K in keyof Flags & `requires${string}`]: Flags[K] extends true
      ? Record<
          FlagToService<K & string> & string,
          InferServiceModel<ServiceBrand<FlagToService<K & string>>>
        >
      : never;
  }[keyof Flags & `requires${string}`]
>;

type ResolveUiServices<Flags> = UnionToIntersection<
  {
    [K in keyof Flags & `requires${string}`]: Flags[K] extends true
      ? Record<
          FlagToService<K & string> & string,
          InferServiceUi<ServiceBrand<FlagToService<K & string>>>
        >
      : never;
  }[keyof Flags & `requires${string}`]
>;
```

### Service requirements via feature flags

Block/plugin developers do not declare services. Feature flags
are hardcoded in SDK — each SDK version knows which services it
needs. The SDK sets the appropriate flags internally.

```typescript
// lib/model/common/src/flags/block_flags.ts
// Boolean require flags added alongside existing numeric ones

// Existing flags unchanged — service flags added via intersection
type BlockCodeKnownFeatureFlags = {
  readonly supportsLazyState?: boolean;
  readonly supportsPframeQueryRanking?: boolean;
  readonly requiresModelAPIVersion?: number;
  readonly requiresUIAPIVersion?: number;
  readonly requiresCreatePTable?: number;
} & ServiceRequireFlags;
// ServiceRequireFlags is derived from Services keys:
// { requiresPFrameSpecV1?: boolean; requiresPFrameSpecV2?: boolean; requiresPFrameV1?: boolean }
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
// Plugin with featureFlags: { requiresPFrameSpecV2: true }
// ctx.services typed as ResolveModelServices<{ requiresPFrameSpecV2: true }>
//   = { pframeSpecV2: PFrameSpecDriverV2 }
.output("table", (ctx) => {
  ctx.services.pframeSpecV2.createSpecFrame(...);  // typed
  ctx.services.pframeV1;  // compile error — not in this plugin's flags
})
```

### Ui-side access

```typescript
// Block — app.services typed as ResolveUiServices<block's merged flags>
const app = useApp();
await app.services.pframeV1.findColumns(handle, request); // typed
app.services.pframeSpecV1.createSpecFrame(specs); // typed, sync WASM

// Plugin — plugin.services typed as ResolveUiServices<plugin's own flags>
const plugin = usePlugin(props.handle);
plugin.services.pframeSpecV2.createSpecFrame(specs); // typed
plugin.services.pframeV1; // compile error — not in this plugin's flags
```

At runtime, all services are loaded in the renderer (from
merged block + all plugin flags). The type-level restriction
only controls what TypeScript allows — `plugin.services` is
typed from the plugin's own flags, `app.services` from the
merged flags.

On the model side, `PluginRenderCtx.services` is typed from
the merged flags (block + this plugin) — plugins can access
both block-level and plugin-level services.

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
// serviceMethods fetched from worker via IPC — no manual method lists
function createUiRegistry(serviceMethods: Record<string, string[]>): ServiceRegistry {
  return new ServiceRegistry()
    .register(Services.PFrameSpecV1, () => new SpecDriver())
    .register(Services.PFrameSpecV2, () => new SpecDriver())
    .register(Services.PFrameV1, () => createIpcProxy("pframeV1", serviceMethods["pframeV1"] ?? []));
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
    if (this.factories.has(id)) throw new ServiceAlreadyRegisteredError(id);
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
// Derives service ids from flag names — no manual map.
// Convention: flag "requiresPFrameSpecV1" → service id "pframeSpecV1"

function resolveRequiredServices(flags: BlockCodeKnownFeatureFlags | undefined): string[] {
  if (!flags) return [];
  return Object.entries(flags)
    .filter(([key, value]) => key.startsWith("requires") && value === true)
    .map(([key]) => {
      const stripped = key.slice("requires".length);
      return stripped[0].toLowerCase() + stripped.slice(1);
    });
}
```

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

// Module-level const — immutable, created once
const SERVICE_INJECTORS: ReadonlyMap<string, ServiceInjector> = new Map<string, ServiceInjector>([
  [Services.PFrameSpecV1, (registerFn, registry, parent) => {
    const driver = registry.get(Services.PFrameSpecV1);
    registerFn(serviceFnKey("pframeSpecV1", "createSpecFrame"), (specs) =>
      parent.exportSingleValue(
        driver.createSpecFrame(parent.importObjectViaJson(specs)),
        undefined,
      ),
    );
    registerFn(serviceFnKey("pframeSpecV1", "discoverColumns"), (handle, request) =>
      parent.exportObjectViaJson(
        driver.specFrameDiscoverColumns(
          parent.vm.getString(handle),
          parent.importObjectViaJson(request),
        ),
      ),
    );
    // ... remaining methods
  });

  // ... additional service entries
]);
```

```typescript
// computable_context.ts — in injectCtx()

const requiredServiceIds = resolveRequiredServices(this.featureFlags);
const serviceFunctions = new Map<string, VmFunctionImplementation>();
const registerFn = (name: string, fn: VmFunctionImplementation) => {
  serviceFunctions.set(name, fn);
};

// Dynamic injection based on feature flags
for (const serviceId of requiredServiceIds) {
  const injector = SERVICE_INJECTORS.get(serviceId);
  if (!injector) throw new ServiceNotRegisteredError(serviceId);
  try {
    injector(registerFn, this.registry, this.parent);
  } catch (e) {
    throw new ServiceInjectionError(serviceId, e);
  }
}
// [] means no services (valid). undefined featureFlags = legacy block,
// inject SpecDriver unconditionally (existing lines 926-979).

exportCtxFunction("getServiceMethods", (serviceIdHandle) => {
  const serviceId = parent.vm.getString(serviceIdHandle);
  const pfx = serviceFnKey(serviceId);
  const methods = [...serviceFunctions.keys()]
    .filter((k) => k.startsWith(pfx))
    .map((k) => k.slice(pfx.length));
  return parent.exportObjectViaJson(methods);
});

exportCtxFunction("callServiceMethod", (serviceIdHandle, methodHandle, ...argHandles) => {
  const serviceId = parent.vm.getString(serviceIdHandle);
  const method = parent.vm.getString(methodHandle);
  const fn = serviceFunctions.get(serviceFnKey(serviceId, method));
  if (!fn) throw new ServiceMethodNotFoundError(serviceId, method);
  return fn(...argHandles);
});
```

### Model-side typed services access

Services getter lives on `RenderCtxBase` — both `BlockRenderCtx`
and `PluginRenderCtx` inherit it.

```typescript
// sdk/model/src/render/api.ts

// S generic carries the typed service map (from ResolveModelServices<Flags>)
class RenderCtxBase<Args, Data, S = {}> {
  private cachedServices?: S;

  get services(): S {
    if (!this.cachedServices) {
      const { callServiceMethod, getServiceMethods } = this.ctx;
      this.cachedServices = Object.freeze(
        Object.fromEntries(
          this.requiredServiceIds.map((id) => [
            id,
            Object.freeze(
              Object.fromEntries(
                (getServiceMethods(id) as string[]).map((method) => [
                  method,
                  (...args: unknown[]) => callServiceMethod(id, method, ...args),
                ]),
              ),
            ),
          ]),
        ),
      ) as S;
    }
    return this.cachedServices;
  }
}

// BlockRenderCtx<Args, Data, S> and PluginRenderCtx<F, S> both
// extend RenderCtxBase — services getter inherited, S typed per context.
```

```typescript
// sdk/model/src/render/internal.ts
callServiceMethod(serviceId: string, methodName: string, ...args: unknown[]): unknown;
getServiceMethods(serviceId: string): string[];
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
// sdk/model/src/platforma.ts — add to existing PlatformaV3 interface
readonly services: Record<string, unknown>; // always set by preload, {} if no services
```

```typescript
// packages/preload-block/src/services/init_services.ts
function initServices(
  serviceIds: string[],
  uiRegistry: ServiceRegistry,
  serviceMethods: Record<string, string[]>,
): Record<string, unknown> {
  // Lazy getters via ??= — service instantiated on first access, cached in closure.
  return Object.create(
    null,
    Object.fromEntries(
      serviceIds.map((id) => {
        let cached: unknown;
        return [
          id,
          {
            enumerable: true,
            get() {
              return (cached ??= uiRegistry.get(id));
            },
          },
        ];
      }),
    ),
  );
}
```

```typescript
// 3. packages/preload-block/src/v3-preload.ts
export function v3(blockParams: BlockParamsWithApi): PlatformaV3 {
  const { blobDriver, logDriver, lsDriver, pFrameDriver } = initDrivers(blockParams);

  // blockParams only has projectId, blockId, apiVersion — no flags.
  // Fetch flags + method lists from the worker before block is shown.
  const { featureFlags, serviceMethods } = await ipc.v3("getServiceInfo", blockParams);
  // serviceMethods: Record<string, string[]> e.g. { pframeV1: ["findColumns", "getColumnSpec", ...] }
  const serviceIds = resolveRequiredServices(featureFlags);
  const uiRegistry = createUiRegistry(serviceMethods);
  const services = initServices(serviceIds, uiRegistry, serviceMethods);

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
  services: markRaw(platforma.services),
};
```

`markRaw` prevents Vue from wrapping lazy getter properties
with its own reactivity.

```typescript
// sdk/ui-vue/src/usePlugin.ts
// Runtime: passes full platforma.services (no filtering).
// Type-level: usePlugin<F>() returns services typed as ResolveUiServices<F's flags>.
function createPluginState(handle) {
  return {
    // ... existing data, outputs, outputErrors ...
    services: platforma.services, // full set at runtime, narrowed by type param
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

// Extracts method names from instance (own + prototype, excludes constructor)
function getMethodNames(instance: object): string[] {
  const methods = new Set<string>();
  let proto: object | null = instance;
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key !== "constructor" && typeof (instance as Record<string, unknown>)[key] === "function") {
        methods.add(key);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...methods];
}

function createServiceRouter(routes: Record<string, object>) {
  Object.entries(routes).forEach(([serviceId, instance]) =>
    getMethodNames(instance).forEach((method) =>
      ipcMain.handle(serviceIpcChannel(serviceId, method), async (_event, ...args) => {
        const fn = (instance as Record<string, Function>)[method];
        return wrapResult(await fn.apply(instance, args));
      }),
    ),
  );
}

// No manual method lists — extracted from instance at registration time
createServiceRouter({
  [Services.PFrameV1]: pframeDriver,
});
```

### Handling missing services

Existing `RuntimeCapabilities` protects against unrecognized
`requires*` flags — no new mechanism needed:

```text
addBlock() / updateBlockPack()
  └─ throwIfIncompatible(featureFlags)       [project.ts:216,309]
  └─ Blocks with unsupported flags cannot be added

Project overview
  └─ checkCompatibility(featureFlags)        [project_overview.ts:176-180]
  └─ Marks incompatible blocks with isIncompatibleWithRuntime: true
```

Service flags (`requiresPFrameSpecV1`, etc.) are standard
`requires*` flags — they get this protection automatically.
The Desktop registers supported service flags at startup via
`RuntimeCapabilities.addSupportedRequirement()`.

For version transitions (V1 → V2), both flags remain registered
as supported until V1 is fully removed. Once removed, blocks
requiring V1 fail the compatibility check and show the standard
"unsupported requirements" error.

### IPC proxy for node services

```typescript
// preload-block/src/services/ipc_proxy.ts
// Auto-generates proxy from method list fetched via IPC — no manual enumeration.

function createIpcProxy(serviceId: string, methods: string[]): Record<string, Function> {
  return Object.freeze(
    Object.fromEntries(
      methods.map((method) => [
        method,
        async (...args: unknown[]) => {
          const result = await ipcRenderer.invoke(serviceIpcChannel(serviceId, method), ...args);
          return unwrapResult(result);
        },
      ]),
    ),
  );
}
```

```typescript
// lib/model/common/src/errors.ts — alongside PFrameError hierarchy
// Same pattern: base → dotted name subclasses → is* guards

export class ServiceError extends Error {
  name = "ServiceError";
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof Error && error.name.startsWith("ServiceError");
}

export class ServiceInvalidIdError extends ServiceError {
  name = "ServiceError.InvalidId";
  constructor(readonly serviceId: string) {
    super(`Invalid service id "${serviceId}": must match /^[a-zA-Z][a-zA-Z0-9]*$/`);
  }
}

export class ServiceAlreadyRegisteredError extends ServiceError {
  name = "ServiceError.AlreadyRegistered";
  constructor(readonly serviceId: string) {
    super(`Service "${serviceId}" already registered`);
  }
}

export class ServiceInjectionError extends ServiceError {
  name = "ServiceError.Injection";
  constructor(
    readonly serviceId: string,
    cause: unknown,
  ) {
    super(`Failed to inject service "${serviceId}"`, { cause });
  }
}

export class ServiceNotRegisteredError extends ServiceError {
  name = "ServiceError.NotRegistered";
  constructor(readonly serviceId: string) {
    super(`Service not registered: ${serviceId}`);
  }
}

export function isServiceNotRegisteredError(error: unknown): error is ServiceNotRegisteredError {
  return error instanceof Error && error.name === "ServiceError.NotRegistered";
}

export class ServiceMethodNotFoundError extends ServiceError {
  name = "ServiceError.MethodNotFound";
  constructor(
    readonly serviceId: string,
    readonly method: string,
  ) {
    super(`Method "${method}" not found on service "${serviceId}"`);
  }
}

export function isServiceMethodNotFoundError(error: unknown): error is ServiceMethodNotFoundError {
  return error instanceof Error && error.name === "ServiceError.MethodNotFound";
}

// No ServiceCallAbortedError — when the renderer process is destroyed,
// all pending promises and closures are cleaned up by the runtime.
// No explicit disposal or abort mechanism needed.
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
   └─ initServices() builds object with lazy getters from Ui registry
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
   `initServices`, lazy getters in preload. `services` on
   `PlatformaV3`. `app.services` in `createAppV3`.
5. **PFrameDriver:** Into registry. Hand-written remote proxy.
   Service router. Remove from unconditional `DriverKit`.
6. **Table plugin:** Uses `app.services.pframeSpecV1` and
   `app.services.pframeV1` — flags set by SDK automatically.

## Changes by file

### platforma

| File                                                                | Change                                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/model/common/src/services/defs.ts` (new)                       | `ServiceId`, `ServiceTypesLike`, `InferServiceModel`, `service()`, `serviceFnKey()`, `serviceIpcChannel()`                            |
| `lib/model/common/src/services/flag_mapping.ts` (new)               | `resolveRequiredServices()` — derives service ids from flag names                                                                     |
| `lib/model/common/src/services/registry.ts` (new)                   | `ServiceRegistry`                                                                                                                     |
| `lib/model/common/src/errors.ts`                                    | `ServiceError` base + `ServiceNotRegisteredError`, `ServiceMethodNotFoundError` + `is*` guards                                        |
| `sdk/model/src/services/defs.ts` (new)                              | `Services` const, `ServiceRequireFlags`, `FlagToService`, `ResolveModelServices`, `ResolveUiServices`                                 |
| `lib/model/common/src/flags/block_flags.ts`                         | Add boolean `requiresPFrameSpecV1`, `requiresPFrameSpecV2`, `requiresPFrameV1` to type AND `AllRequiresFeatureFlags` array            |
| `lib/model/common/src/flags/flag_utils.ts`                          | `RuntimeCapabilities` — support boolean require flags + service compatibility check                                                   |
| `lib/model/common/src/driver_kit.ts`                                | Remove `pFrameDriver` (phase 5)                                                                                                       |
| `sdk/model/src/block_model.ts`                                      | Set service flags in `INITIAL_BLOCK_FEATURE_FLAGS`. Pass resolved service ids to `BlockRenderCtx` and `PluginRenderCtx` in `.done()`. |
| `sdk/model/src/render/api.ts`                                       | `S` generic + `services` getter on `RenderCtxBase`. Inherited by `BlockRenderCtx` and `PluginRenderCtx`.                              |
| `sdk/model/src/render/internal.ts`                                  | `callServiceMethod()` + `getServiceMethods()` on `GlobalCfgRenderCtxMethods`                                                          |
| `lib/node/pl-middle-layer/src/js_render/service_injectors.ts` (new) | `ServiceInjector` type + `SERVICE_INJECTORS` const map                                                                                |
| `lib/node/pl-middle-layer/src/js_render/computable_context.ts`      | `resolveRequiredServices()`, conditional injection via injectors, `callServiceMethod`, `getServiceMethods`                            |
| `lib/node/pl-middle-layer/src/middle_layer/driver_kit.ts`           | Create model `ServiceRegistry`                                                                                                        |
| `sdk/model/src/platforma.ts`                                        | `services` on `PlatformaV3`                                                                                                           |
| `sdk/ui-vue/src/internal/createAppV3.ts`                            | `markRaw(platforma.services)` on app object                                                                                           |
| `sdk/ui-vue/src/usePlugin.ts`                                       | Pass `platforma.services` through to plugin state (no scoping)                                                                        |

### platforma-desktop-app

| File                                                         | Change                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `packages/preload-block/src/services/init_services.ts` (new) | `initServices()` with lazy getters                                                              |
| `packages/preload-block/src/services/ipc_proxy.ts` (new)     | `createIpcProxy()` — auto-generates IPC proxy from method list                                  |
| `packages/preload-block/src/v3-preload.ts`                   | `getServiceInfo` IPC, `createUiRegistry`, `initServices()`, attach `services` to platforma      |
| `packages/main/src/ipc/serviceRouter.ts` (new)               | `createServiceRouter()` — auto-extracts methods from instances                                  |
| `packages/worker/src/workerApi.ts`                           | Model `ServiceRegistry` in `MiddleLayer.init()`. `getServiceInfo` handler.                      |
| `packages/ipc/src/ipc.ts`                                    | Add `v3("getServiceInfo", blockParams)` IPC call                                                |

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
