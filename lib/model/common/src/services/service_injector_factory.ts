/**
 * UI service injector factory.
 *
 * When adding a new node service, add its method wrappers here.
 * Everything else (SERVICE_METHOD_MAP, buildServiceInfo, UiServiceInjectorMap)
 * auto-derives from this factory + Services in service_declarations.ts.
 */

import type { DriverKit } from "../driver_kit";
import type { UiServiceInjectorMap } from "./service_injectors";

export function createUiServiceInjectors(driverKit: DriverKit): UiServiceInjectorMap {
  const { pFrameDriver } = driverKit;
  return {
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
    },
  };
}
