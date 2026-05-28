/**
 * Test-only wiring for `ColumnsCollectionDriverModel`. Wraps a real
 * `ColumnsCollectionDriverImpl` (so the discover / filter algebra is exercised
 * end-to-end) with stub bindings backed by an in-memory `(id → spec)` map.
 *
 * Accessor-based source kinds (`"accessor"`, `"result_pool"`) throw — they
 * have no meaning outside a render ctx. Tests should stick to `"ids"` /
 * `"collection"` sources.
 *
 * Calling {@link TestCollectionDriverHandle.installAmbientCtx} additionally
 * installs a minimal `globalThis.cfgRenderCtx` AND plants a stub
 * `ColumnEntriesProvider` into the ctx-providers cache so registered specs
 * are reachable via `ColumnLazy.fromId` (and therefore via
 * `ColumnsCollection.getColumns()`).
 */
import type {
  ColumnEntriesProvider,
  ColumnsCollectionDriverHost,
  ColumnsCollectionDriverModel,
  LeafEntry,
  PColumnSpec,
  PObjectId,
  ServiceName,
} from "@milaboratories/pl-model-common";
import { extractPObjectId, Services } from "@milaboratories/pl-model-common";
import { ColumnsCollectionDriverImpl } from "@milaboratories/columns-collection-driver";
import { SpecDriver } from "@milaboratories/pf-spec-driver";
import type { GlobalCfgRenderCtx } from "../../render/internal";
import { TreeNodeAccessor } from "../../render/accessor";
import { _ctxProvidersCache } from "../column_providers";
import type { ColumnsProvider } from "../column_providers";
import { ColumnLazy, ColumnLazyImpl } from "../column_lazy";

export interface TestCollectionDriverHandle {
  readonly driver: ColumnsCollectionDriverModel;
  /** Register `(id → spec)` pairs the driver will see via `resolveSpec`. */
  register(columns: ReadonlyArray<{ readonly id: PObjectId; readonly spec: PColumnSpec }>): void;
  /**
   * Install a minimal `globalThis.cfgRenderCtx` so `getService("columnsCollection")`
   * resolves to this driver and registered columns are reachable via
   * `ColumnLazy.fromId`. Call inside `beforeEach` if the code under test uses
   * the ambient ctx instead of an explicit `driver` option.
   */
  installAmbientCtx(): void;
  /** Remove the ambient ctx installed by {@link installAmbientCtx}. */
  uninstallAmbientCtx(): void;
  /** Dispose the underlying SpecDriver. */
  dispose(): Promise<void>;
}

const COLUMNS_COLLECTION_METHODS: ReadonlyArray<string> = [
  "create",
  "isEmpty",
  "isFinal",
  "getColumns",
  "addSource",
  "discover",
  "filter",
];

const PFRAME_SPEC_METHODS: ReadonlyArray<string> = [
  "createSpecFrame",
  "listColumns",
  "discoverColumns",
  "deleteColumn",
  "evaluateQuery",
  "buildQuery",
  "expandAxes",
  "collapseAxes",
  "findAxis",
  "findTableColumn",
];

export function createTestCollectionDriver(): TestCollectionDriverHandle {
  const specMap = new Map<PObjectId, PColumnSpec>();
  const specDriver = new SpecDriver();
  const impl = new ColumnsCollectionDriverImpl();

  const bindings: ColumnsCollectionDriverHost = {
    resolveAccessor: () => {
      throw new Error("test collection driver: no accessor support");
    },
    getUpstreamBlockCtxes: () => [],
    getSpecDriver: () => specDriver,
    resolveSpec: (id) => specMap.get(extractPObjectId(id)),
  };

  const driver: ColumnsCollectionDriverModel = {
    create: (sources) => impl.create(sources, bindings).key,
    isEmpty: (h) => impl.isEmpty(h),
    isFinal: (h) => impl.isFinal(h),
    getColumns: (h) => impl.getColumns(h, bindings),
    addSource: (h, srcs) => impl.addSource(h, srcs, bindings).key,
    discover: (h, o) => impl.discover(h, o, bindings).key,
    filter: (h, o) => impl.filter(h, o, bindings).key,
  };

  let installedCtx: GlobalCfgRenderCtx | undefined;

  return {
    driver,
    register(columns) {
      for (const c of columns) specMap.set(c.id, c.spec);
      if (installedCtx !== undefined) {
        _ctxProvidersCache.set(installedCtx, [buildStubProvider(specMap)]);
      }
    },
    installAmbientCtx() {
      const ctx = {
        getAccessorHandleByName: () => undefined,
        getUpstreamBlockCtx: () => [],
        getServiceNames: () => [Services.ColumnsCollection, Services.PFrameSpec] as ServiceName[],
        getServiceMethods: (id: ServiceName) => {
          if ((id as unknown) === Services.ColumnsCollection)
            return COLUMNS_COLLECTION_METHODS.slice();
          if ((id as unknown) === Services.PFrameSpec) return PFRAME_SPEC_METHODS.slice();
          return [];
        },
        callServiceMethod: (id: ServiceName, method: string, ...args: unknown[]) => {
          if ((id as unknown) === Services.ColumnsCollection) {
            const fn = (driver as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
            return fn(...args);
          }
          if ((id as unknown) === Services.PFrameSpec) {
            const fn = (specDriver as unknown as Record<string, (...a: unknown[]) => unknown>)[
              method
            ];
            return fn.apply(specDriver, args);
          }
          throw new Error(`test ctx: service "${id}" not stubbed`);
        },
      } as unknown as GlobalCfgRenderCtx;
      installedCtx = ctx;
      (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
      _ctxProvidersCache.set(ctx, [buildStubProvider(specMap)]);
    },
    uninstallAmbientCtx() {
      installedCtx = undefined;
      delete (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx;
    },
    async dispose() {
      await specDriver.dispose();
    },
  };
}

/**
 * Construct a {@link ColumnEntriesProvider} + {@link ColumnsProvider} backed
 * by an `(id → spec)` map. Each entry carries a fake {@link TreeNodeAccessor}
 * whose only contract is the surface `readSpec` / `readData` /
 * `readDataStatus` (in `p_column_lazy.ts`) actually call:
 *   - `traverse({field: `${name}.spec`, ignoreError: true})` →
 *     stub-accessor whose `getDataAsJson()` returns the spec.
 *   - `traverse({field: `${name}.data`})` → `undefined` (data is not
 *     materialised in tests).
 *   - `listInputFields()` → `[]` (data absent).
 *   - `getInputsLocked()` → `true` (no pending resolution).
 */
function buildStubProvider(
  specMap: ReadonlyMap<PObjectId, PColumnSpec>,
): ColumnEntriesProvider<TreeNodeAccessor> & ColumnsProvider {
  const entries = new Map<PObjectId, LeafEntry<TreeNodeAccessor>>();
  for (const [id, spec] of specMap) {
    entries.set(id, { accessor: stubAccessorFor(id, spec), name: id, id });
  }
  const columns: ColumnLazy[] = [];
  for (const [id, spec] of specMap) {
    columns.push(ColumnLazyImpl.fromColumn({ id, spec, data: undefined as never }));
  }
  return {
    getPObjectEntries: () => entries,
    isFinal: () => true,
    getColumns: () => columns,
  };
}

function stubAccessorFor(id: PObjectId, spec: PColumnSpec): TreeNodeAccessor {
  const specField = `${id}.spec`;
  const specHolder = {
    getDataAsJson: <T>() => spec as unknown as T,
    hasData: () => true,
  };
  const stub = {
    handle: id,
    resolvePath: [],
    traverse: (...steps: unknown[]) => {
      if (steps.length === 0) return stub;
      const first = steps[0] as { field?: string } | string;
      const field = typeof first === "string" ? first : first?.field;
      return field === specField ? specHolder : undefined;
    },
    getDataAsJson: <T>() => spec as unknown as T,
    listInputFields: () => [],
    getInputsLocked: () => true,
  };
  return stub as unknown as TreeNodeAccessor;
}
