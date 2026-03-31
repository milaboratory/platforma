import type { QuickJSHandle, VmFunctionImplementation } from "quickjs-emscripten";
import type { Branded, InferServiceModel, ServiceTypesLike } from "@milaboratories/pl-model-common";
import { Services, ServiceNotRegisteredError } from "@milaboratories/pl-model-common";
import type {
  AxesId,
  AxesSpec,
  DataInfo,
  PColumn,
  PColumnSpec,
  PColumnValues,
  PTableColumnId,
  PTableColumnSpec,
  SingleAxisSelector,
  DeleteColumnRequest,
  DiscoverColumnsRequest,
  PFrameDef,
  SpecQuery,
  PTableDef,
  PTableDefV2,
  SpecFrameHandle,
} from "@milaboratories/pl-model-common";
import { PoolEntryGuard } from "@milaboratories/pl-model-common";
import type { JsExecutionContext } from "./context";
import type { ComputableContextHelper } from "./computable_context";

type VmMethod = VmFunctionImplementation<QuickJSHandle>;

export type ServiceInjectorContext = {
  host: ComputableContextHelper;
  vm: JsExecutionContext;
};

// Each injector returns a record of method name -> VM function implementation.
// The framework automatically registers them with serviceFnKey(serviceId, methodName).
export type ServiceInjector<Methods extends string = string> = (
  ctx: ServiceInjectorContext,
) => Record<Methods, VmMethod>;

// Extract the model interface from a branded ServiceName
type ServiceBrand<T> = T extends Branded<string, infer S extends ServiceTypesLike> ? S : never;

// Type-safe injector for a specific service — must return all methods from the model interface.
type ServiceInjectorFor<S extends keyof typeof Services> = ServiceInjector<
  string & keyof InferServiceModel<ServiceBrand<(typeof Services)[S]>>
>;

// Complete, type-checked injector map.
// Adding a service to Services without an entry here is a compile-time error.
// Missing a method from the interface is also a compile-time error.
type ServiceInjectorMap = { [K in keyof typeof Services]: ServiceInjectorFor<K> };

export function getServiceInjectors(): ServiceInjectorMap {
  return {
    PFrameSpec: ({ host, vm }: ServiceInjectorContext) => {
      const driver = host.serviceRegistry.get(Services.PFrameSpec);
      if (!driver)
        throw new ServiceNotRegisteredError(
          `Service "${Services.PFrameSpec}" has no factory in ModelServiceRegistry. Provide a non-null factory.`,
        );

      return {
        createSpecFrame: (specs: QuickJSHandle) => {
          using guard = new PoolEntryGuard(
            driver.createSpecFrame(vm.importObjectViaJson(specs) as Record<string, PColumnSpec>),
          );
          host.addOnDestroy(guard.entry.unref);
          const entry = guard.keep();
          // TODO: add [Symbol.dispose] once QuickJS supports ES2024 explicit resource management
          const obj = vm.vm.newObject();
          vm.vm.newString(entry.key).consume((k) => vm.vm.setProp(obj, "key", k));
          vm.vm
            .newFunction("unref", () => {
              entry.unref();
            })
            .consume((fn) => vm.vm.setProp(obj, "unref", fn));
          return obj;
        },

        discoverColumns: (handle: QuickJSHandle, request: QuickJSHandle) =>
          vm.exportObjectViaJson(
            driver.discoverColumns(
              vm.vm.getString(handle) as SpecFrameHandle,
              vm.importObjectViaJson(request) as DiscoverColumnsRequest,
            ),
          ),

        deleteColumn: (handle: QuickJSHandle, request: QuickJSHandle) =>
          vm.exportObjectViaJson(
            driver.deleteColumn(
              vm.vm.getString(handle) as SpecFrameHandle,
              vm.importObjectViaJson(request) as DeleteColumnRequest,
            ),
          ),

        evaluateQuery: (handle: QuickJSHandle, request: QuickJSHandle) =>
          vm.exportObjectViaJson(
            driver.evaluateQuery(
              vm.vm.getString(handle) as SpecFrameHandle,
              vm.importObjectViaJson(request) as SpecQuery,
            ),
          ),

        expandAxes: (spec: QuickJSHandle) =>
          vm.exportObjectViaJson(driver.expandAxes(vm.importObjectViaJson(spec) as AxesSpec)),

        collapseAxes: (ids: QuickJSHandle) =>
          vm.exportObjectViaJson(driver.collapseAxes(vm.importObjectViaJson(ids) as AxesId)),

        findAxis: (spec: QuickJSHandle, selector: QuickJSHandle) =>
          vm.exportSingleValue(
            driver.findAxis(
              vm.importObjectViaJson(spec) as AxesSpec,
              vm.importObjectViaJson(selector) as SingleAxisSelector,
            ),
          ),

        findTableColumn: (tableSpec: QuickJSHandle, selector: QuickJSHandle) =>
          vm.exportSingleValue(
            driver.findTableColumn(
              vm.importObjectViaJson(tableSpec) as PTableColumnSpec[],
              vm.importObjectViaJson(selector) as PTableColumnId,
            ),
          ),
      };
    },

    PFrame: ({ host, vm }: ServiceInjectorContext) => ({
      createPFrame: (def: QuickJSHandle) =>
        vm.exportSingleValue(
          host.createPFrame(
            vm.importObjectViaJson(def) as PFrameDef<
              PColumn<string | PColumnValues | DataInfo<string>>
            >,
          ),
        ),

      createPTable: (def: QuickJSHandle) =>
        vm.exportSingleValue(
          host.createPTable(
            vm.importObjectViaJson(def) as PTableDef<
              PColumn<string | PColumnValues | DataInfo<string>>
            >,
          ),
        ),

      createPTableV2: (def: QuickJSHandle) =>
        vm.exportSingleValue(
          host.createPTableV2(
            vm.importObjectViaJson(def) as PTableDefV2<
              PColumn<string | PColumnValues | DataInfo<string>>
            >,
          ),
        ),
    }),
  };
}
