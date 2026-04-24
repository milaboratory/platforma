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
 *
 * Secondary (and slightly wrong) role: this factory is also read by the UI
 * at module load to derive SERVICE_METHOD_MAP via `getMethodNames` on a
 * stub-kit result. That's why a `main` service (Dialog) currently has a
 * stub entry here — its method names must surface in SERVICE_METHOD_MAP so
 * the UI-side ServiceProxy can build forwarders. Once method names are
 * moved into the service declaration itself, this stub should be deleted
 * and the factory will contain only honest node-service handlers.
 */

import type { DriverKit } from "../driver_kit";
import type { NodeServiceHandlerMap } from "./service_injectors";

function mainServiceStub(): never {
  throw new Error(
    "main service stub should not be invoked — calls are routed via IPC ServiceProxy",
  );
}

export function createNodeServiceHandlers(driverKit: DriverKit): NodeServiceHandlerMap {
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
