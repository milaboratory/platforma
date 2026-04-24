/**
 * UI service injector factory.
 *
 * When adding a new node/main service, add its method wrappers here.
 * Everything else (SERVICE_METHOD_MAP, buildServiceInfo, UiServiceInjectorMap)
 * auto-derives from this factory + Services in service_declarations.ts.
 *
 * Main services have no UI-side implementation — the desktop app forwards
 * each call via IPC. The injector entries exist only so getMethodNames can
 * introspect method names for SERVICE_METHOD_MAP; the stub bodies throw
 * and are never reached at runtime.
 */

import type { DriverKit } from "../driver_kit";
import type { UiServiceInjectorMap } from "./service_injectors";

function mainServiceStub(): never {
  throw new Error(
    "main service stub should not be invoked — calls are routed via IPC ServiceProxy",
  );
}

export function createUiServiceInjectors(driverKit: DriverKit): UiServiceInjectorMap {
  const { pFrameDriver } = driverKit;
  return {
    Dialog: {
      showSaveDialog: mainServiceStub,
    },
    PFrame: {
      findColumns: (handle, request) => pFrameDriver.findColumns(handle, request),
      getColumnSpec: (handle, columnId) => pFrameDriver.getColumnSpec(handle, columnId),
      listColumns: (handle) => pFrameDriver.listColumns(handle),
      calculateTableData: (handle, request, range) =>
        pFrameDriver.calculateTableData(handle, request, range),
      getUniqueValues: (handle, request) => pFrameDriver.getUniqueValues(handle, request),
      getShape: (handle) => pFrameDriver.getShape(handle),
      getSpec: (handle) => pFrameDriver.getSpec(handle),
      getData: (handle, columnIndices, range) => pFrameDriver.getData(handle, columnIndices, range),
      writePTableToFs: (handle, options) => pFrameDriver.writePTableToFs(handle, options),
    },
  };
}
