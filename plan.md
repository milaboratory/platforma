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
type ServiceName<S extends ServiceTypesLike = ServiceTypesLike> = Branded<string, S>;

const SERVICE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

// Service type determines how the Ui side accesses the service:
// - "node": Node.js native addon, runs in main/worker, proxied to renderer via IPC
// - "wasm": WASM module, instantiated directly in the renderer, no IPC
type ServiceType = "node" | "wasm";

// Host-side VM dispatch map key (lib/model/common — used by middle layer)
function serviceFnKey(serviceId: string, method = ""): string {
  return `service:${serviceId}:${method}`;
}

type ServiceOptions = {
  readonly type: ServiceType;
  readonly name: string;
};

// service() and isNodeService share a private map via closure.
// Populated at module load time by the Services const, never modified after.
const { service, isNodeService } = (() => {
  const typeMap = new Map<string, ServiceType>();
  return {
    service<Model, Ui>(options: ServiceOptions): ServiceName<ServiceTypesLike<Model, Ui>> {
      const { name, type } = options;
      if (!SERVICE_ID_PATTERN.test(name)) {
        throw new ServiceInvalidIdError(name);
      }
      if (typeMap.has(name)) {
        throw new ServiceAlreadyRegisteredError(name);
      }
      typeMap.set(name, type);
      return name as ServiceName<ServiceTypesLike<Model, Ui>>;
    },
    isNodeService(id: ServiceName): boolean {
      return typeMap.get(id) === "node";
    },
  };
})();
```

```typescript
// sdk/model/src/services/defs.ts
// `import type` only — PFrame packages are devDependencies of sdk/model

const Services = {
  PFrameSpec: service<PFrameSpecDriver, PFrameSpecUiDriver>({ type: "wasm", name: "pframeSpec" }),
  PFrame: service<PFrameModelDriver, PFrameDriver>({ type: "node", name: "pframe" }),
};

// All service names as a union: "pframeSpec" | "pframe"
type AllServiceNames = (typeof Services)[keyof typeof Services] & string;

// Record requiring a factory for every service — missing entry is a type error
type ServiceFactoryRecord = Record<AllServiceNames, () => unknown>;

// Typed factory — enforces completeness at the signature level.
// Lives in sdk/model (not lib/model/common) because it needs Services.
function createServiceRegistry(factories: ServiceFactoryRecord): ServiceRegistry {
  const registry = new ServiceRegistry();
  for (const [id, factory] of Object.entries(factories)) {
    registry.register(id as ServiceName, factory);
  }
  return registry;
}

// Derive requires* feature flags from Services keys
// PFrameSpec → requiresPFrameSpec?: boolean
type ServiceRequireFlags = {
  [K in keyof typeof Services as `requires${K & string}`]?: boolean;
};

// Map flag name back to Services entry: "requiresPFrameSpec" → typeof Services.PFrameSpec
type FlagToService<Flag extends string> = Flag extends `requires${infer K}`
  ? K extends keyof typeof Services
    ? (typeof Services)[K]
    : never
  : never;

type InferServiceUi<S extends ServiceTypesLike> =
  S extends ServiceTypesLike<unknown, infer U> ? U : unknown;

// Extract the brand S from ServiceName<S>
type ServiceBrand<T> = T extends Branded<string, infer S extends ServiceTypesLike> ? S : never;

// Resolve typed services from feature flags
// { requiresPFrameSpec: true } → { pframeSpec: PFrameSpecDriver }
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

Feature flags are hardcoded in SDK — each SDK version knows
which services it needs. Block/plugin developers do not declare
services.

```typescript
// lib/model/common/src/flags/block_flags.ts

// Service flags added via intersection — existing flags unchanged
type BlockCodeKnownFeatureFlags = {
  readonly supportsLazyState?: boolean;
  readonly supportsPframeQueryRanking?: boolean;
  readonly requiresModelAPIVersion?: number;
  readonly requiresUIAPIVersion?: number;
  readonly requiresCreatePTable?: number;
} & ServiceRequireFlags;
// Produces: { requiresPFrameSpec?: boolean; requiresPFrame?: boolean }
```

`BlockCodeFeatureFlags` already allows `boolean | number` on
`requires*` keys — no base type change needed.

```typescript
// Update _AllFlagsAreCovered assertion to accept service flags
// from ServiceRequireFlags (type-derived from Services const):

type _AllFlagsAreCovered = Assert<
  Is<
    keyof BlockCodeKnownFeatureFlags,
    | ArrayTypeUnion<typeof AllRequiresFeatureFlags, typeof AllSupportsFeatureFlags>
    | keyof ServiceRequireFlags // automatically includes requiresPFrameSpec etc.
  >
>;
// Adding a service to the Services const automatically satisfies this assertion.
```

```typescript
// sdk/model/src/block_model.ts — flags hardcoded in SDK, not set by devs
static readonly INITIAL_BLOCK_FEATURE_FLAGS: BlockCodeKnownFeatureFlags = {
  supportsLazyState: true,
  supportsPframeQueryRanking: true,
  requiresUIAPIVersion: 3,
  requiresModelAPIVersion: BLOCK_STORAGE_FACADE_VERSION,
  requiresCreatePTable: 2,
  requiresPFrameSpec: true,  // SDK v3 always requires PFrameSpec
};
```

### Model-side access

```typescript
// ctx.services typed from merged feature flags
.output("table", (ctx) => {
  ctx.services.pframeSpec.createSpecFrame(...);  // typed
  ctx.services.pframe;  // compile error if requiresPFrame not set
})
```

### Ui-side access

```typescript
// Block — app.services typed as ResolveUiServices<block's merged flags>
const app = useApp();
await app.services.pframe.findColumns(handle, request); // typed
app.services.pframeSpec.createSpecFrame(specs); // typed, sync WASM

// Plugin — plugin.services typed as ResolveUiServices<plugin's own flags>
const plugin = usePlugin(props.handle);
plugin.services.pframeSpec.createSpecFrame(specs); // typed
```

All services load in the renderer from merged block + plugin
flags. Type-level restriction controls what TypeScript allows —
`plugin.services` is typed from the plugin's own flags,
`app.services` from the merged flags.

On the model side, `PluginRenderCtx.services` is typed from
the merged flags (block + this plugin).

### App-side registration

```typescript
type ModelRegistryOptions = {
  env: MiddleLayerEnvironment;
};

// Model side — called from initDriverKit() in driver_kit.ts
function createModelRegistry(options: ModelRegistryOptions): ServiceRegistry {
  const { env } = options;
  return createServiceRegistry({
    [Services.PFrameSpec]: () => new SpecDriver(),
    [Services.PFrame]: () => createPFrameDriver(env),
  });
}

type UiRegistryOptions = {
  serviceMethods: Record<ServiceName, string[]>;
};

// Ui side — called from v3-preload.ts
function createUiRegistry(options: UiRegistryOptions): ServiceRegistry {
  const { serviceMethods } = options;
  return createServiceRegistry({
    [Services.PFrameSpec]: () => new SpecDriver(),
    [Services.PFrame]: () => createIpcProxy("pframe", serviceMethods),
  });
}
```

## Implementation

### ServiceRegistry

```typescript
// lib/model/common/src/services/registry.ts

class ServiceRegistry {
  private factories = new Map<string, () => unknown>();
  private instances = new Map<string, unknown>();

  // Factory return type is unknown — actual typing happens at call site
  // via ResolveModelServices/ResolveUiServices. Same registry class
  // serves both model side (InferServiceModel) and Ui side (InferServiceUi).
  register(id: ServiceName, factory: () => unknown): this {
    if (this.factories.has(id)) throw new ServiceAlreadyRegisteredError(id);
    this.factories.set(id, factory);
    return this;
  }

  get<S extends ServiceTypesLike>(id: ServiceName<S>): InferServiceModel<S>;
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
// sdk/model/src/services/flag_mapping.ts (NOT lib/model/common — needs Services const)

function resolveRequiredServices(flags: BlockCodeKnownFeatureFlags | undefined): ServiceName[] {
  if (!flags) return [];
  return (Object.keys(Services) as (keyof typeof Services)[])
    .filter((key) => flags[`requires${key}` as keyof BlockCodeKnownFeatureFlags] === true)
    .map((key) => Services[key]);
}
```

### Config data path

```text
BlockModelV3.done()
  └─ Emits featureFlags (including requiresPFrameSpec: true etc.)
       └─ Serialized into BlockConfigContainer → stored in block pack

Middle layer reads config:
  extractCodeWithInfo()
    └─ Extracts featureFlags (unchanged)
         └─ ComputableContextHelper receives featureFlags
              └─ resolveRequiredServices(featureFlags) → service name list
              └─ Inject only those services into VM
```

### VM injection — ServiceInjector pattern

Service instances live in Node.js. Plugin output lambdas run
inside QuickJS. Live objects cannot cross the boundary — each
service method is registered in a host-side dispatch map and
accessed via `callServiceMethod`.

```typescript
// lib/node/pl-middle-layer/src/js_render/service_injectors.ts

type ServiceInjector = (
  registerFn: (name: string, fn: VmFunctionImplementation) => void,
  registry: ServiceRegistry,
  parent: JsExecutionContext,
) => void;

// Module-level const — immutable, created once
const SERVICE_INJECTORS: ReadonlyMap<string, ServiceInjector> = new Map<string, ServiceInjector>([
  [Services.PFrameSpec, (registerFn, registry, parent) => {
    const driver = registry.get(Services.PFrameSpec);
    registerFn(serviceFnKey("pframeSpec", "createSpecFrame"), (specs) =>
      parent.exportSingleValue(
        driver.createSpecFrame(parent.importObjectViaJson(specs)),
        undefined,
      ),
    );
    registerFn(serviceFnKey("pframeSpec", "discoverColumns"), (handle, request) =>
      parent.exportObjectViaJson(
        driver.specFrameDiscoverColumns(
          parent.vm.getString(handle),
          parent.importObjectViaJson(request),
        ),
      ),
    );
    // Must register ALL methods used by ColumnCollectionBuilder and callers:
    // createSpecFrame, specFrameDiscoverColumns, disposeSpecFrame,
    // expandAxes, collapseAxes, findAxis, findTableColumn
  });

  // ... additional service entries
]);
```

```typescript
// computable_context.ts — in injectCtx()

const requiredServiceNames = resolveRequiredServices(this.featureFlags);
const serviceFunctions = new Map<string, VmFunctionImplementation>();
const registerFn = (name: string, fn: VmFunctionImplementation) => {
  serviceFunctions.set(name, fn);
};

// Dynamic injection based on feature flags
for (const serviceId of requiredServiceNames) {
  const injector = SERVICE_INJECTORS.get(serviceId);
  if (!injector) throw new ServiceNotRegisteredError(serviceId);
  try {
    injector(registerFn, this.registry, this.parent);
  } catch (e) {
    throw new ServiceInjectionError(serviceId, e);
  }
}
// [] = no services (valid). undefined featureFlags = legacy block.
//
// Legacy unconditional SpecDriver injection ("Spec Frames" section in `injectCtx()`)
// is REMOVED entirely. No desktop release shipped it as public API.
// All SpecDriver access goes through ctx.services.pframeSpec exclusively.

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

Services getter on `RenderCtxBase` — both `BlockRenderCtx`
and `PluginRenderCtx` inherit it.

```typescript
// sdk/model/src/render/api.ts

// S generic carries the typed service map (from ResolveModelServices<Flags>)
class RenderCtxBase<Args = unknown, Data = unknown, S = {}> {
  protected readonly ctx: GlobalCfgRenderCtx;
  private readonly requiredServiceNames: string[];
  private cachedServices?: S;

  constructor(requiredServiceNames: string[] = []) {
    this.ctx = getCfgRenderCtx();
    this.requiredServiceNames = requiredServiceNames;
  }

  get services(): S {
    if (!this.cachedServices) {
      const { callServiceMethod, getServiceMethods } = this.ctx;
      this.cachedServices = Object.freeze(
        Object.fromEntries(
          this.requiredServiceNames.map((id) => [
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
// block_model.ts — in .done()

// Block-level service names (from block's own merged flags)
const blockServiceNames = resolveRequiredServices(this.config.featureFlags);

// BlockRenderCtx construction (line 547 area) — pass service names via super()
new BlockRenderCtx<Args, Data, ResolveModelServices<typeof this.config.featureFlags>>(
  blockServiceNames,
);

// PluginRenderCtx construction (line 557 area) — merged block + plugin flags
const pluginServiceNames = resolveRequiredServices(
  mergeFeatureFlags(this.config.featureFlags, plugin.featureFlags ?? {}),
);
outputFn(new PluginRenderCtx(handle, wrappedInputs, pluginServiceNames));
```

`PluginRenderCtx` constructor calls `super(requiredServiceNames)` to
set the field on `RenderCtxBase`.

### Ui-side provision

Two injection paths:

- **WASM services:** Direct instance in renderer. Sync calls.
- **Node services:** IPC proxy. Async calls.

```typescript
// sdk/model/src/platforma.ts — add to existing PlatformaV3 interface
readonly services: Record<ServiceName, unknown>; // always set by preload, {} if no services
```

```typescript
// packages/preload-block/src/services/init_services.ts
function initServices(serviceIds: string[], uiRegistry: ServiceRegistry): Record<string, unknown> {
  // Lazy getters — service instantiated on first access, cached in closure.
  return Object.create(
    null,
    Object.fromEntries(
      serviceIds.map((id) => {
        let fetched = false;
        let cached: unknown;
        return [
          id,
          {
            enumerable: true,
            get() {
              if (!fetched) {
                cached = uiRegistry.get(id);
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
```

```typescript
// packages/core/src/ipc_channels.ts — Electron-specific, NOT in lib/model/common
function serviceIpcChannel(serviceId: string, method: string): string {
  return `service:call:${serviceId}:${method}`;
}

// packages/core/src/args.ts — typed additionalArguments helpers
type ArgDef<T> = { readonly key: string; readonly schema: z.ZodType<T> };

function defineArg<T>(key: string, schema: z.ZodType<T>): ArgDef<T> {
  return { key, schema };
}

function setArg<T>(args: string[], def: ArgDef<T>, value: T): void {
  args.push(`${def.key}=${JSON.stringify(value)}`);
}

function getArg<T>(def: ArgDef<T>): T {
  const prefix = `${def.key}=`;
  const raw = process.argv.find((a) => a.startsWith(prefix));
  return def.schema.parse(raw ? JSON.parse(raw.slice(prefix.length)) : undefined);
}

const ServiceInfoArg = defineArg("serviceInfo", z.object({
  featureFlags: z.record(z.union([z.boolean(), z.number()])).optional(),
  serviceMethods: z.record(z.array(z.string())).default({}) as z.ZodType<Record<ServiceName, string[]>>,
}));

// packages/main/src/windows.ts
// activateBlockView becomes async — getServiceInfo must complete before
// WebContentsView construction (additionalArguments are immutable after that).
// Caller in LoadBlockFrontend.execute() is already async.
//
// Cache stores the in-flight Promise, not the resolved view — concurrent calls
// for the same block await the same promise instead of each creating a view.
async activateBlockView(params: BlockParams): Promise<WebContentsView> {
  const cacheKey = blockCacheKey(params);
  const existing = this.viewCache.get(cacheKey);
  if (existing) return existing;

  const pending = (async () => {
    const args: string[] = [];
    setArg(args, ServiceInfoArg, await this.app.worker.getServiceInfo(params));
    const blockView = new WebContentsView({
      webPreferences: { ...webPreferencesForBlock, additionalArguments: args },
    });
    // ... attach to window ...
    return blockView;
  })();

  this.viewCache.set(cacheKey, pending);
  return pending;
}

// packages/worker/src/workerApi.ts — getServiceInfo implementation
async getServiceInfo(params: BlockParams): Promise<z.infer<typeof ServiceInfoArg["schema"]>> {
  const ml = getMl();
  const featureFlags = await ml.getBlockFeatureFlags(params);
  const serviceIds = resolveRequiredServices(featureFlags);
  const registry = ml.serviceRegistry;
  // Only introspect node services — WASM services are instantiated directly
  // in the renderer and don't need method names transmitted via argv.
  const nodeServiceNames = serviceIds.filter(isNodeService);
  const serviceMethods = Object.fromEntries(
    nodeServiceNames.map((id) => [id, getMethodNames(registry.get(id))]),
  );
  return { featureFlags, serviceMethods };
}

// packages/preload-block/src/v3-preload.ts
// v3() stays synchronous — service info read from process.argv via getArg
export function v3(blockParams: BlockParamsWithApi): PlatformaV3 {
  const { blobDriver, logDriver, lsDriver, pFrameDriver } = initDrivers(blockParams);

  const serviceInfo = getArg(ServiceInfoArg);
  const serviceIds = resolveRequiredServices(serviceInfo.featureFlags);
  const uiRegistry = createUiRegistry({ serviceMethods: serviceInfo.serviceMethods });
  const services = initServices(serviceIds, uiRegistry);

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
await app.services.pframe.findColumns(handle, request);
app.services.pframeSpec.createSpecFrame(specs); // sync WASM
```

### Service router

```typescript
// platforma-desktop-app/packages/main/src/ipc/serviceRouter.ts
// getMethodNames lives in @platforma/core (shared between main + worker)

function getMethodNames(instance: object): string[] {
  const methods = new Set<string>();
  let proto: object | null = instance;
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      // Use descriptor to avoid invoking getters during introspection.
      // descriptor.value (not instance[key]) checks the exact prototype level.
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (key !== "constructor" && typeof descriptor?.value === "function") {
        methods.add(key);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...methods];
}

// Router auto-builds from model registry — only node services get IPC handlers.
// WASM services (e.g. PFrameSpec) are instantiated directly in the renderer
// and never proxied over IPC.
function createServiceRouter(registry: ServiceRegistry) {
  Object.values(Services)
    .filter(isNodeService)
    .forEach((serviceId) => {
      const instance = registry.get(serviceId as string);
      getMethodNames(instance).forEach((method) =>
        ipcMain.handle(serviceIpcChannel(serviceId as string, method), async (_event, ...args) => {
          const fn = (instance as Record<string, Function>)[method];
          return wrapResult(await fn.apply(instance, args));
        }),
      );
    });
}

createServiceRouter(modelRegistry);
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

Service flags (`requiresPFrameSpec`, etc.) are standard
`requires*` flags — they get this protection automatically.
The Desktop registers supported service flags at startup:

```typescript
// lib/node/pl-middle-layer/src/middle_layer/middle_layer.ts — alongside existing calls at lines 335-337
// Automated from Services const — adding a service automatically registers the flag.
for (const key of Object.keys(Services)) {
  runtimeCapabilities.addSupportedRequirement(`requires${key}` as SupportedRequirement, true);
}
// Test harnesses (test-block.ts, with-ml.ts) need the same loop.
```

### Legacy SpecDriver removal

No desktop release shipped SpecDriver as public API. The
unconditional injection ("Spec Frames" section in `injectCtx()`)
is removed. All callers migrate to `ctx.services.pframeSpec`:

```typescript
// sdk/model/src/render/api.ts — remove 7 wrapper methods (lines 725-752):
// createSpecFrame, specFrameDiscoverColumns, disposeSpecFrame,
// expandAxes, collapseAxes, findAxis, findTableColumn
// Callers use ctx.services instead.

// sdk/model/src/columns/column_collection_builder.ts
// Before: this.specFrameCtx.createSpecFrame(specs)
// After:  this.services.pframeSpec.createSpecFrame(specs)
// SpecFrameCtx type (lines 25-28) replaced by service interface.

// sdk/model/src/components/PlDataTable/createPlDataTable/createPlDataTableV3.ts
// Before: new ColumnCollectionBuilder(ctx)
// After:  new ColumnCollectionBuilder(ctx.services.pframeSpec)
```

```typescript
// lib/node/pl-middle-layer/src/js_render/computable_context.ts
// Remove "Spec Frames" section in injectCtx() (unconditional SpecDriver injection).
// Remove SpecDriver instance field (line 72).
// SpecDriver now only instantiated via ServiceRegistry factory.
```

For version transitions (V1 → V2), both flags remain registered
as supported until V1 is fully removed. Once removed, blocks
requiring V1 fail the compatibility check.

### IPC proxy for node services

```typescript
// preload-block/src/services/ipc_proxy.ts

function createIpcProxy(
  serviceId: string,
  serviceMethods: Record<ServiceName, string[]>,
): Record<string, Function> {
  return Object.freeze(
    Object.fromEntries(
      (serviceMethods[serviceId] ?? []).map((method) => [
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
    super(`Invalid service ID "${serviceId}": must match /^[a-zA-Z][a-zA-Z0-9]*$/`);
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

// No ServiceCallAbortedError — renderer process destruction handles cleanup.
```

### Lifecycle

```text
1. App starts
   └─ Model registry + Ui registry created with all service factories
   └─ Service router registers IPC channels (node services only)

2. Block loaded
   └─ Block config contains featureFlags: { requiresPFrameSpec: true, ... }
   └─ Plugin flags merged via mergeFeatureFlags() (boolean OR)

3. Compatibility check (RuntimeCapabilities)
   └─ Boolean require flags: true = required, registry must have it
   └─ available → proceed, deprecated → error, unknown → error

4. Model context created
   └─ resolveRequiredServices(featureFlags) → service name list
   └─ ServiceInjectors register methods in host-side dispatch map
   └─ callServiceMethod exported to VM

5. Ui loaded
   └─ Service info from process.argv (set by main via additionalArguments)
   └─ resolveRequiredServices(featureFlags) → service name list
   └─ initServices() builds object with lazy getters from Ui registry
   └─ Attached to platforma.services → createAppV3 → app.services
```

## Migration path

1. **Service infrastructure:** `ServiceRegistry`, `ServiceName`,
   `resolveRequiredServices`, feature flags, error types.
2. **Boolean require flags:** Add boolean `requires*` support to
   `RuntimeCapabilities`. Add service flags to
   `BlockCodeKnownFeatureFlags`. Set initial flags in
   `BlockModelV3.INITIAL_BLOCK_FEATURE_FLAGS`.
3. **Model-side services:** `ServiceRegistry`,
   `createServiceInjectors`, `callServiceMethod` in
   `ComputableContextHelper`. `services` on `PluginRenderCtx`.
4. **Ui-side services:** `initServices`, lazy getters in
   preload. `additionalArguments` for service info.
   `services` on `PlatformaV3`. `app.services` in `createAppV3`.
5. **PFrameDriver:** Into registry. Hand-written remote proxy.
   Service router. Remove from unconditional `DriverKit`.
6. **Table plugin:** Uses `app.services.pframeSpec` and
   `app.services.pframe` — flags set by SDK automatically.

## Changes by file

### platforma

| File                                                                | Change                                                                                                                                                   |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/model/common/src/services/defs.ts` (new)                       | `ServiceName`, `ServiceTypesLike`, `InferServiceModel`, `ServiceType`, `service()`, `isNodeService()`, `serviceFnKey()`                                  |
| `sdk/model/src/services/defs.ts` (new)                              | `Services` const, `ServiceFactoryRecord`, `createServiceRegistry()`, `ServiceRequireFlags`, `FlagToService`, `ResolveModelServices`, `ResolveUiServices` |
| `sdk/model/src/services/flag_mapping.ts` (new)                      | `resolveRequiredServices()` — derives service names from `Services` const                                                                                |
| `lib/model/common/src/services/registry.ts` (new)                   | `ServiceRegistry`                                                                                                                                        |
| `lib/model/common/src/errors.ts`                                    | `ServiceError` base + `ServiceNotRegisteredError`, `ServiceMethodNotFoundError` + `is*` guards                                                           |
| `lib/model/common/src/flags/block_flags.ts`                         | Extend type via `& ServiceRequireFlags`. Update `_AllFlagsAreCovered` assertion.                                                                         |
| `lib/model/common/src/flags/flag_utils.ts`                          | `RuntimeCapabilities` — support boolean require flags + service compatibility check                                                                      |
| `lib/model/common/src/driver_kit.ts`                                | Remove `pFrameDriver` (phase 5)                                                                                                                          |
| `sdk/model/src/block_model.ts`                                      | Set service flags in `INITIAL_BLOCK_FEATURE_FLAGS`. Pass resolved service names to `BlockRenderCtx` and `PluginRenderCtx` in `.done()`.                  |
| `sdk/model/src/render/api.ts`                                       | `S` generic + `services` getter on `RenderCtxBase`. Remove 7 legacy SpecDriver wrapper methods.                                                          |
| `sdk/model/src/columns/column_collection_builder.ts`                | Replace `SpecFrameCtx` with service interface.                                                                                                           |
| `sdk/model/src/components/PlDataTable/.../createPlDataTableV3.ts`   | Pass `ctx.services.pframeSpec` to `ColumnCollectionBuilder`.                                                                                             |
| `sdk/model/src/render/internal.ts`                                  | Add `callServiceMethod()` + `getServiceMethods()`. Remove 7 legacy SpecDriver methods.                                                                   |
| `lib/node/pl-middle-layer/src/js_render/service_injectors.ts` (new) | `ServiceInjector` type + `SERVICE_INJECTORS` const map                                                                                                   |
| `lib/node/pl-middle-layer/src/js_render/computable_context.ts`      | Remove unconditional SpecDriver. Add injectors, `callServiceMethod`, `getServiceMethods`.                                                                |
| `lib/node/pl-middle-layer/src/middle_layer/driver_kit.ts`           | Create model `ServiceRegistry`                                                                                                                           |
| `lib/node/pl-middle-layer/src/middle_layer/middle_layer.ts`         | Register service flags via `addSupportedRequirement` loop                                                                                                |
| `sdk/test/src/test-block.ts`                                        | Same `addSupportedRequirement` loop for test harness                                                                                                     |
| `sdk/model/src/platforma.ts`                                        | `services` on `PlatformaV3`                                                                                                                              |
| `sdk/ui-vue/src/internal/createAppV3.ts`                            | `markRaw(platforma.services)` on app object                                                                                                              |
| `sdk/ui-vue/src/usePlugin.ts`                                       | Pass `platforma.services` through to plugin state                                                                                                        |

### platforma-desktop-app

| File                                                         | Change                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `packages/core/src/args.ts` (new)                            | `defineArg()`, `setArg()`, `getArg()`, `ServiceInfoArg`                                       |
| `packages/core/src/ipc_channels.ts` (new)                    | `serviceIpcChannel()`                                                                         |
| `packages/core/src/get_method_names.ts` (new)                | `getMethodNames()` — shared by main + worker                                                  |
| `packages/preload-block/src/services/init_services.ts` (new) | `initServices()` with lazy getters                                                            |
| `packages/preload-block/src/services/ipc_proxy.ts` (new)     | `createIpcProxy()`                                                                            |
| `packages/preload-block/src/v3-preload.ts`                   | Read `serviceInfo` from `process.argv`, `createUiRegistry`, `initServices()`, attach services |
| `packages/main/src/ipc/serviceRouter.ts` (new)               | `createServiceRouter()` — node services only                                                  |
| `packages/main/src/windows.ts`                               | `activateBlockView` becomes async. Promise-based view cache.                                  |
| `packages/main/src/tasks/LoadBlockFrontend.ts`               | `await` the now-async `activateBlockView`.                                                    |
| `packages/worker/src/workerApi.ts`                           | Model `ServiceRegistry` in `MiddleLayer.init()`. `getServiceInfo` (node services only).       |

## Backward compatibility

```text
featureFlags without service require flags (old blocks):
  └─ resolveRequiredServices() returns []
  └─ No services injected
  └─ These blocks never had SpecDriver access (no desktop release shipped it)

featureFlags with service require flags (new blocks):
  └─ resolveRequiredServices() returns the declared services
  └─ Only those services injected via ServiceInjector
  └─ Access via ctx.services.pframeSpec exclusively
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
Existing tests    → column_collection_builder.test.ts works as-is (SpecDriver satisfies new type)
                     Add a test verifying the full callServiceMethod dispatch path
Integration       → register services, load block, verify app.services
```
