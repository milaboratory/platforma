# Unified service provider

## API at a glance

### Defining services

```typescript
// sdk/model/src/services/defs.ts
// Must use `import type` only for PFrame interfaces (they are devDependencies)

const Services = {
  PFrameSpecV1: defineService<PFrameSpecDriver, PFrameSpecUiDriver>("pframeSpec.v1"),
  PFrameSpecV2: defineService<PFrameSpecDriverV2, PFrameSpecUiDriverV2>("pframeSpec.v2"),
  PFrameV1: defineService<PFrameModelDriver, PFrameDriver>("pframe.v1"),
} as const;
```

### Attaching to block and plugin models

```typescript
// Block model
const model = BlockModel.create("v3")
  .service(Services.PFrameSpecV1)
  .service(Services.PFrameV1)
  // ...
  .done();

// Plugin model
const tablePlugin = PluginModel.define({ name, data })
  .service(Services.PFrameSpecV2)
  .output("table", (ctx) => {
    const spec = ctx.service(Services.PFrameSpecV2); // typed as PFrameSpecDriverV2
    // ...
  })
  .build();
```

### Registering in the app

```typescript
// Model side
const modelRegistry = new ServiceRegistry({
  [Services.PFrameSpecV1.id]: () => new SpecDriver(),
  [Services.PFrameSpecV2.id]: () => new SpecDriver(),
  [Services.PFrameV1.id]: () => pframeDriver,
});

// Ui side
const uiRegistry = new ServiceRegistry({
  [Services.PFrameSpecV1.id]: () => new SpecDriver(), // WASM instance
  [Services.PFrameSpecV2.id]: () => new SpecDriver(), // WASM instance
  [Services.PFrameV1.id]: () => pframeDriverProxy, // hand-written remote proxy
});
```

## Problem

| Existing driver    | Backend                                  | Execution                                      |
| ------------------ | ---------------------------------------- | ---------------------------------------------- |
| `PFrameSpecDriver` | WASM (`pframes-rs-wasm`)                 | Sync — callable from model and Ui directly     |
| `PFrameDriver`     | Node.js native addon (`pframes-rs-node`) | Async — Ui calls main process via remote proxy |

Both are injected unconditionally today. Both will have versioned
successors. Old versions persist forever — the app bundles all
versions and injects only what each block requested. No data
migrations needed since these only provide methods.

## Terminology

| Term                           | Meaning                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**                    | Versioned capability defined via `defineService<TModel, TUi>()`. Each service has a unique id and carries model and Ui interfaces as type params. |
| **Service def**                | The `ServiceDef<TModel, TUi>` value — a branded identifier used to declare, register, and look up a service. Created once via `defineService()`.  |
| **Model interface** (`TModel`) | Service surface for block/plugin output lambdas (server-side). May include write operations.                                                      |
| **Ui interface** (`TUi`)       | Service surface for Ui components (client-side). Typically read-only. Delivered as a direct WASM instance or a hand-written remote proxy.         |
| **Service registry**           | Maps service defs to lazy factories. Two instances: one for model side, one for Ui side.                                                          |

## Current state

### How drivers are provided today

```text
Model side:
  MiddleLayer.init()
    └─ initDriverKit()                         [driver_kit.ts:61-154]
         └─ driverKit.pFrameDriver             unconditional
              └─ ComputableContextHelper        [computable_context.ts]
                   └─ injectCtx() → QuickJS    exports to cfgRenderCtx
                        └─ RenderCtxBase        [api.ts:560-770]

Ui side:
  initDrivers(blockParams)                     [preload-block/drivers.ts:40-141]
    └─ pFrameDriver wraps ipc.pFrame()         each method → ipcRenderer.invoke()
         └─ ipcMain.handle("pFrame:call:*")    [main/ipc/pFrameDriver.ts:22-84]
              └─ worker.pFrame()               routes to MiddleLayer driverKit
```

`PluginRenderCtx` (`api.ts:822-880`) has access to neither
driver. The SpecDriver infrastructure is already plumbed through
`GlobalCfgRenderCtxMethods` (`internal.ts`) —
`PluginRenderCtx` does not delegate to it (see migration
phase 1).

### Feature flags

```typescript
// lib/model/common/src/flags/block_flags.ts:17-23
type BlockCodeKnownFeatureFlags = {
  readonly supportsLazyState?: boolean;
  readonly supportsPframeQueryRanking?: boolean;
  readonly requiresModelAPIVersion?: number;
  readonly requiresUIAPIVersion?: number;
  readonly requiresCreatePTable?: number;
};
```

`RuntimeCapabilities` (`flag_utils.ts:67-127`) checks `requires*`
flags against app support. Unsatisfied flags throw
`IncompatibleFlagsError`. Plugin flags merge via
`mergeFeatureFlags()` — boolean OR, numeric MAX
(`block_model.ts:65-80`).

`BlockCodeKnownFeatureFlags` has a type assertion constraining
keys to `supports*` (boolean) or `requires*` (number). Service
requirements cannot be added here — they need a separate field
on the block config.

## Design

### Service def

```typescript
// lib/model/common/src/services/defs.ts

const _registeredIds = new Set<string>();

interface ServiceDef<TModel = unknown, TUi = unknown> {
  readonly id: string;
  /** Phantom — enables type inference in ctx.service(), not structural branding */
  readonly _phantom?: [TModel, TUi];
}

function defineService<TModel, TUi>(id: string): ServiceDef<TModel, TUi> {
  if (_registeredIds.has(id)) {
    throw new Error(`Duplicate service id: "${id}"`);
  }
  _registeredIds.add(id);
  return { id };
}

/** Test-only. Call in beforeEach when multiple test files share a
 *  vitest worker. Clears the duplicate-id Set so defineService()
 *  calls in re-imported modules succeed. vi.resetModules() is NOT
 *  needed — clearing the Set is sufficient. */
function __resetServiceDefsForTests(): void {
  _registeredIds.clear();
}
```

A service def is an identifier carrying `TModel` and `TUi` at
the type level. The phantom enables return-type inference in
`ctx.service(def)` — it does not prevent structural assignment
between different defs (standard TypeScript limitation). The
runtime `Set` check prevents accidental id collisions. The `Set`
assumes a single module instance (valid for production bundles;
HMR during development may reset it).

The `Services` const lives in `sdk/model/src/services/defs.ts`
(not `lib/model/common`) to avoid pulling PFrame-specific types
into the shared common package. This module must use
`import type` exclusively — the PFrame packages are
`devDependencies` of `sdk/model`. `ServiceDef` and
`defineService` stay in `lib/model/common`.

### Declaring requirements

```typescript
// sdk/model/src/block_model.ts — addition to BlockModelV3
service<TModel, TUi>(def: ServiceDef<TModel, TUi>): this {
  this.requiredServices.push(def.id);
  return this;
}
```

Service ids are stored as a separate `requiredServices: string[]`
field on the block config (`BlockConfigV4Generic` in
`block_config.ts`), not inside `featureFlags`. Feature flags have
type constraints (`supports*`/`requires*` keys, boolean/number
values) that prevent adding an array field.

Plugin services merge into the block's list in `.plugin()`:

```typescript
// block_model.ts — in .plugin(), alongside featureFlags merge at line 476
this.config.requiredServices = [
  ...new Set([...this.config.requiredServices, ...(plugin.requiredServices ?? [])]),
];
```

The merged `requiredServices` is emitted in `.done()` as part
of the block config (alongside `featureFlags`, `code`, etc.).

### Config data path

```text
BlockModelV3.done()
  └─ Emits requiredServices in block config     [block_model.ts:565-591]
       └─ Serialized into BlockConfigContainer  [container.ts]
            └─ Stored in block pack

Middle layer reads config:
  extractCodeWithInfo()                         [must be extended]
    └─ Extracts requiredServices alongside featureFlags
         └─ Passed to ComputableContextHelper constructor
              (currently receives only featureFlags — add requiredServices)
```

### Typed access in plugins

```typescript
// Plugin output lambda — function call, not property indexing
.output("table", (ctx) => {
  const spec = ctx.service(Services.PFrameSpecV2);
  // spec is typed as PFrameSpecDriverV2 (inferred from TModel)
})
```

`ctx.service(def)` is a function call with type inference. The
`ServiceDef<TModel>` type param flows through to the return
type. Service access is validated at runtime (the service must be
in the block's `requiredServices` list), not at compile time.

On the model side, service methods are exported individually
into the block execution context as named functions — the same
pattern used for existing SpecDriver methods.
`PluginRenderCtx.service()` accesses these through the existing
render context:

```typescript
// sdk/model/src/render/api.ts — addition to PluginRenderCtx
class PluginRenderCtx<F extends PluginFactoryLike> {
  service<TModel, TUi>(def: ServiceDef<TModel, TUi>): TModel {
    return this.ctx.getService(def.id) as TModel;
  }
}
```

### Handling missing services

Four statuses for service ids stored in the block config:

| Status     | Condition                             | Behavior                                                                                                                                                             |
| ---------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Available  | Registry has a factory                | Block loads normally.                                                                                                                                                |
| Superseded | Service id is in `SupersededServices` | Block loads normally. Informational warning shown to user.                                                                                                           |
| Deprecated | Service id is in `DeprecatedServices` | Block does not load. Error: "Block `{name}` requires `{id}` which is no longer supported. Use a newer block version."                                                |
| Unknown    | Service id not in any list            | Block does not load. Error: "Block `{name}` requires `{id}` which is not recognized. If you are a block developer, check the service id. Otherwise, update Desktop." |

```typescript
// lib/model/common/src/services/deprecated.ts
const SupersededServices: Record<string, string> = {
  // id → successor id (service still works, but block should upgrade)
  "pframeSpec.v1": "pframeSpec.v2",
};

const DeprecatedServices: Record<string, string> = {
  // id → human-readable reason (service removed, block must upgrade)
  "pframeSpec.v0": "Removed in Desktop 2.5.",
};
```

"Superseded" handles the transition period when V2 is shipped but
V1 is not yet removed. Both remain in the registry; the block
loads normally but the user sees a non-blocking warning.
"Deprecated" is for services fully removed from the registry.

The "Unknown" message covers both genuinely new services (update
Desktop) and typos in the block manifest (developer error).

### Model-side provision

```typescript
// Model side resolves services for each block
for (const serviceId of block.requiredServices) {
  const service = modelRegistry.getFactory(serviceId)();
  // Export each method individually into block execution context
}
```

The model registry reads `requiredServices` from the block config
and instantiates each service. Methods are exported individually
as named functions (not as live objects) because the block
execution context does not support object references.

### Ui-side provision

```typescript
// Ui side — registers factories, does NOT instantiate
function initServices(blockParams: BlockParamsWithApi, serviceIds: string[]) {
  const services: Record<string, () => unknown> = {};
  for (const id of serviceIds) {
    services[id] = uiRegistry.getFactory(id);
  }
  return lazyMap(services);
}
```

Ui services are lazy — the factory is called on first access,
not at block load. This avoids penalizing block open time with
WASM initialization that may never be needed.

`lazyMap` — new utility in `lib/model/common`:

```typescript
/** Wraps a record of factories into a Proxy that calls each
 *  factory on first access and caches the result. */
function lazyMap<T extends Record<string, () => unknown>>(factories: T): LazyMap<T> {
  const keys = Object.keys(factories);
  const cache = new Map<string, unknown>();

  function resolve(key: string): unknown {
    if (!cache.has(key)) {
      const factory = factories[key];
      if (!factory) return undefined;
      cache.set(key, factory());
    }
    return cache.get(key);
  }

  return new Proxy({} as LazyMap<T>, {
    get(_target, key: PropertyKey) {
      if (typeof key !== "string") return undefined;
      return resolve(key);
    },
    has(_target, key: PropertyKey) {
      return typeof key === "string" && key in factories;
    },
    ownKeys() {
      return keys;
    },
    getOwnPropertyDescriptor(_target, key: PropertyKey) {
      if (typeof key !== "string" || !(key in factories)) return undefined;
      // Getter, not value — avoids eager instantiation on spread/serialize
      return { configurable: true, enumerable: true, get: () => resolve(key) };
    },
  });
}
```

If the factory throws, the error propagates and the value is not
cached — the next access retries. Cached instances are freed
when the block Ui is destroyed (garbage collected with the
renderer heap).

**WASM services:** Instantiated in the renderer on first call.
Only services declared by the block are loaded.

**Node services:** A hand-written remote proxy mirroring the
`TUi` interface. Each proxy follows the existing `pFrameDriver`
pattern (`preload-block/drivers.ts:97-133`) — method-by-method
delegation to IPC calls. Proxies are lightweight (no init cost),
but still lazy for consistency.

### Service router

All remote proxy calls go through the service router. Each
registration includes an explicit method list (matching the
existing `pFrameDriver.ts:22-84` pattern):

```typescript
// platforma-desktop-app/packages/main/src/ipc/serviceRouter.ts

interface ServiceRoute {
  instance: unknown;
  methods: string[]; // explicit list, not runtime discovery
}

function createServiceRouter(routes: Record<string, ServiceRoute>) {
  for (const [serviceId, route] of Object.entries(routes)) {
    for (const method of route.methods) {
      ipcMain.handle(`service:call:${serviceId}:${method}`, async (_event, ...args) => {
        const fn = (route.instance as Record<string, Function>)[method];
        // wrapResult/unwrapResult: existing ResultOrError<T> IPC envelope
        // from base/createRouter.ts — serializes errors across the IPC boundary
        return wrapResult(await fn.apply(route.instance, args));
      });
    }
  }
}

// Usage
createServiceRouter({
  [Services.PFrameV1.id]: {
    instance: pframeDriver,
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

Method lists are explicit — no runtime discovery. This matches
the existing `createRouter` pattern that registers each method
individually.

If a Ui-side proxy is registered for a service that has no
model-side counterpart, no IPC channels exist for it — calls
fail immediately instead of hanging.

### Lifecycle

```text
1. App starts
   └─ Model registry created with all supported service factories
   └─ Service router registers IPC channels for all model services

2. Block loaded
   └─ Block config contains requiredServices: ["pframeSpec.v1", "pframe.v1"]
   └─ Plugin services auto-merged via .plugin() (set union, deduped)

3. Compatibility check
   └─ Each id: available → proceed, superseded → warn (non-blocking),
      deprecated → error "update block", unknown → error "check id or update Desktop"

4. Model context created
   └─ Model interfaces resolved from model registry (lazy, shared)
   └─ Each method exported individually to block execution context

5. Ui loaded
   └─ Service ids sent via IPC after window load
   └─ Ui registry wraps factories in lazyMap (no instantiation yet)
   └─ Exposed to Ui as platforma.services
   └─ Instances created on first access
```

### Multi-version support

```typescript
class ServiceRegistry {
  private factories: Map<string, () => unknown>;
  private instances = new Map<string, unknown>();

  constructor(factories: Record<string, () => unknown>) {
    this.factories = new Map(Object.entries(factories));
  }

  /** Singleton per id — factory called at most once. */
  get<T>(def: ServiceDef<T, any>): T {
    let instance = this.instances.get(def.id);
    if (instance === undefined) {
      const factory = this.factories.get(def.id);
      if (!factory) throw new ServiceNotRegisteredError(def.id);
      instance = factory();
      this.instances.set(def.id, instance);
    }
    return instance as T;
  }

  getFactory(id: string): () => unknown {
    const factory = this.factories.get(id);
    if (!factory) throw new ServiceNotRegisteredError(id);
    return factory;
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }
}
```

One model registry and one Ui registry, each created via
constructor with all factories. Each block context gets
references to the services it declared. V1 blocks get v1, v2
blocks get v2. No migrations.

When two plugins in the same block declare different versions of
the same service (e.g. `pframeSpec.v1` and `pframeSpec.v2`), both
ids appear in the merged list. Both are resolved independently —
each plugin's `ctx.service()` returns the version it declared.

### View eviction and in-flight calls

Model-side service instances are shared across blocks and live
for the app lifetime. Renderer-side instances (WASM or proxy)
live in the block Ui's JavaScript heap and are freed when the
block Ui is destroyed. Lazy services that were never accessed
have no instance to leak.

In-flight IPC calls from an evicted block Ui lose their response
channel — the remote proxy promise will never resolve.

Each block gets a `BlockServiceContext` created during
`initServices()`. It owns a single `AbortController` and all
remote proxies for that block. On eviction,
`BlockServiceContext.dispose()` aborts the controller, which
rejects every pending proxy promise.

```typescript
// preload-block/src/services/block_service_context.ts

class BlockServiceContext implements Disposable {
  private readonly abort = new AbortController();

  /** Creates a proxy method that is abort-aware. */
  createProxyCall(serviceId: string, method: string) {
    return (...args: unknown[]): Promise<unknown> => {
      if (this.abort.signal.aborted) {
        return Promise.reject(new ServiceCallAbortedError(serviceId, method));
      }
      return new Promise((resolve, reject) => {
        const onAbort = () => reject(new ServiceCallAbortedError(serviceId, method));
        this.abort.signal.addEventListener("abort", onAbort, { once: true });
        const cleanup = () => this.abort.signal.removeEventListener("abort", onAbort);
        ipcRenderer.invoke(`service:call:${serviceId}:${method}`, ...args).then(
          (v) => {
            cleanup();
            resolve(v);
          },
          (e) => {
            cleanup();
            reject(e);
          },
        );
      });
    };
  }

  /** Called by WebContentsMap eviction or block close. */
  dispose(): void {
    this.abort.abort();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}
```

`ServiceCallAbortedError` — defined in
`lib/model/common/src/services/errors.ts`:

```typescript
export class ServiceCallAbortedError extends Error {
  readonly name = "ServiceCallAbortedError";
  constructor(
    readonly serviceId: string,
    readonly method: string,
  ) {
    super(`Service call aborted: ${serviceId}.${method}`);
  }
}
```

This error stays in the renderer (does not cross IPC), so it
does not need `ResultOrError` serialization. Block code can
catch and distinguish it by `name` or `instanceof`.

Teardown hook — the main process sends `block:dispose` **before**
`removeAllListeners()` to ensure the preload receives it:

```typescript
// main/src/windows.ts — in WebContentsMap eviction callback
blockView.webContents.send("block:dispose"); // must precede removeAllListeners()
blockView.webContents.removeAllListeners();

// preload-block/src/index.ts — listener via @platforma/ipc
ipc.on("block:dispose", () => {
  blockServiceContext.dispose();
});
```

After `dispose()`, all subsequent proxy calls reject immediately.
WASM instances in the lazy map become unreachable and are garbage
collected with the renderer heap.

## Plugin-to-plugin access

Services are shared infrastructure. Any plugin declaring a
service receives access via `ctx.service()`.

For plugin-to-plugin dependencies beyond shared services:

1. **Params injection** — wire plugin B's output as plugin A's
   params via `BlockModelV3.plugin()`. Already works.
2. **Composite plugins** — higher-level plugin wraps sub-plugins.

## Testing strategy

**Model-side registry:** Testable in plain Node.js via the
`MiddleLayer` test harness (`sdk/test/src/test-block.ts`). No
Electron dependency.

**Ui-side registry:** `ServiceRegistry` is pure TypeScript —
testable without Electron. WASM service instantiation testable
via vitest (same as `pf-spec-driver` tests today).

**Remote proxies and service router:** Require Electron IPC. Test
via the existing e2e harness (`vitest.e2e.config.js`), or
introduce a mock IPC layer that validates channel names and
argument shapes.

**Integration:** Register services, load a block declaring them,
verify `platforma.services` is populated on the Ui side and
calls reach the model-side instances.

## Migration path

1. **Immediate:** Add spec driver delegation methods to
   `PluginRenderCtx` — the infrastructure already exists in
   `GlobalCfgRenderCtx`. No new abstractions.
2. **Service registry:** Introduce `ServiceDef`, `defineService`,
   `ServiceRegistry`, `.service()` on `BlockModelV3` and
   `PluginModelBuilder`. Add `requiredServices` to block config.
   Extend config extraction to read `requiredServices`. Migrate
   `PFrameSpecDriver` as first registry-managed service. Extend
   `RuntimeCapabilities` for service compatibility checks.
3. **PFrameDriver migration:** Move `PFrameDriver` into the
   registry. Write hand-written remote proxy (matching existing
   pattern). Build service router with explicit method lists.
   Remove `pFrameDriver` from unconditional `DriverKit`.
4. **Table plugin:** Build with
   `.service(Services.PFrameSpecV1).service(Services.PFrameV1)`.

## Changes by file

### platforma (SDK monorepo)

| File                                                           | Change                                                                                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/model/common/src/services/defs.ts` (new)                  | `ServiceDef`, `defineService` with duplicate-id check                                                                                              |
| `lib/model/common/src/services/deprecated.ts` (new)            | `SupersededServices`, `DeprecatedServices` maps                                                                                                    |
| `lib/model/common/src/services/registry.ts` (new)              | `ServiceRegistry` class                                                                                                                            |
| `lib/model/common/src/services/lazy_map.ts` (new)              | `lazyMap` utility — Proxy-based, cache-on-first-access, retry on throw                                                                             |
| `lib/model/common/src/services/errors.ts` (new)                | `ServiceCallAbortedError`, `ServiceNotRegisteredError`                                                                                             |
| `sdk/model/src/services/defs.ts` (new)                         | `Services` const (`import type` only for PFrame interfaces)                                                                                        |
| `lib/model/common/src/bmodel/block_config.ts`                  | Add `requiredServices?: string[]` to `BlockConfigV4Generic`                                                                                        |
| `lib/model/common/src/flags/flag_utils.ts`                     | `RuntimeCapabilities.checkServiceCompatibility()` — available/superseded/deprecated/unknown                                                        |
| `lib/model/common/src/driver_kit.ts`                           | Eventually remove `pFrameDriver` (phase 3)                                                                                                         |
| `sdk/model/src/block_model.ts`                                 | Add `.service()` to `BlockModelV3`. Collect service ids. Merge plugin services in `.plugin()` via set-union. Emit `requiredServices` in `.done()`. |
| `sdk/model/src/plugin_model.ts`                                | Add `.service()` to `PluginModelBuilder`. Store service ids in plugin metadata.                                                                    |
| `sdk/model/src/render/api.ts`                                  | Add `service(def)` method to `PluginRenderCtx` — delegates to render context `getService()`.                                                       |
| `sdk/model/src/render/internal.ts`                             | Add `getService(id)` to `GlobalCfgRenderCtxMethods`.                                                                                               |
| `lib/node/pl-middle-layer/src/js_render/computable_context.ts` | Accept `requiredServices`. Resolve from model registry. Export each method individually. Remove unconditional `new SpecDriver()`.                  |
| `lib/node/pl-middle-layer/src/cfg_render/`                     | Extend config extraction to read `requiredServices` and pass to `ComputableContextHelper`.                                                         |
| `lib/node/pl-middle-layer/src/middle_layer/driver_kit.ts`      | Create model `ServiceRegistry` during `initDriverKit()`.                                                                                           |
| `sdk/model/src/platforma.ts`                                   | Add `services` to `PlatformaV3` interface.                                                                                                         |

### platforma-desktop-app

| File                                           | Change                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `packages/preload-block/src/drivers.ts`        | Accept service ids. Create Ui registry. Wrap in `lazyMap`. Expose via `platforma.services`.                                    |
| `packages/preload-block/src/platforma.ts`      | Pass service ids to `initServices()`. Include `services` in platforma object exposed to Ui.                                    |
| `packages/main/src/ipc/serviceRouter.ts` (new) | Service router with explicit method lists per service, following `createRouter` pattern.                                       |
| `packages/main/src/tasks/LoadBlockFrontend.ts` | Send `requiredServices` to block Ui via IPC after window load (not URL query params — avoids length limits and history noise). |
| `packages/worker/src/workerApi.ts`             | Create model `ServiceRegistry` during `MiddleLayer.init()`.                                                                    |

## Backward compatibility

V1/V2 blocks don't use `BlockModelV3` and have no
`requiredServices` field in their config. Detection uses the
existing `requiresModelAPIVersion` flag in `featureFlags` (same
check as `computable_context.ts:584`):

```text
requiresModelAPIVersion < N (V1/V2 blocks):
  └─ No requiredServices in config
  └─ Full DriverKit injected unconditionally (legacy path)

requiresModelAPIVersion >= N (V3+ blocks):
  └─ Reads requiredServices from config
  └─ Only declared services are injected
  └─ pFrameDriver not available unless .service(Services.PFrameV1)
```

(N = the model API version that introduces service support;
determined during implementation.)

This forces V3 blocks to explicitly declare their dependencies
while preserving the existing API surface for older blocks.
`DriverKit` remains as the legacy injection path — no breaking
changes to V1/V2 blocks.
