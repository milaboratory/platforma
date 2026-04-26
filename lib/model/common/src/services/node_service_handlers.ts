/**
 * Worker-side dispatch table for `node`-kind services.
 *
 * Each entry maps a method name to a closure that calls the real driver
 * inside the worker process. Used by `callServiceMethod` in the worker
 * (see `platforma-desktop-app/packages/worker/src/workerApi.ts`) to route
 * incoming IPC calls to concrete driver methods.
 *
 * NOT used for:
 * - `wasm` services — instantiated locally on each consumer (no IPC).
 * - `main` services — dispatched in the Electron main process via its
 *   own router, never reaches the worker.
 */

import type { DriverKit } from "../driver_kit";
import type { NodeServiceHandlerMap } from "./service_injectors";

export function createNodeServiceHandlers(driverKit: DriverKit): NodeServiceHandlerMap {
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
      writePTableToFs: (handle, options) => pFrameDriver.writePTableToFs(handle, options),
    },
  };
}
