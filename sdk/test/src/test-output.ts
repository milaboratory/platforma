import {
  isPColumn,
  parseFinalPObjectCollection,
  type CalculateTableDataResponse,
  type MiddleLayerDriverKit,
} from "@milaboratories/pl-middle-layer";
import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import type { ComputableCtx, UnwrapComputables } from "@milaboratories/computable";
import { LONG_TEST_TIMEOUT } from "@milaboratories/test-helpers";
import { assert } from "vitest";
import { TestWorkflowResults, type TestRenderResults } from "./test-template";
import { awaitStableState } from "./util";

/** Waits for the blob in a workflow or template output and returns its content as text. */
export async function getFileContent<O extends string>(
  result: TestWorkflowResults | TestRenderResults<O>,
  outputName: O,
  driverKit: MiddleLayerDriverKit,
  timeout: number = LONG_TEST_TIMEOUT,
): Promise<string> {
  const callback = (fileHandle: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => {
    if (!fileHandle) return undefined;
    return driverKit.blobDriver.getOnDemandBlob(fileHandle.persist(), ctx).handle;
  };
  const handle = await getOutput(result, outputName, callback, timeout);

  const content = await driverKit.blobDriver.getContent(handle);
  return content.toString();
}

/** Waits for the PColumn collection in an output and returns the full join of its columns. */
export async function getTableData<O extends string>(
  result: TestWorkflowResults | TestRenderResults<O>,
  outputName: O,
  driverKit: MiddleLayerDriverKit,
  timeout: number = LONG_TEST_TIMEOUT,
): Promise<CalculateTableDataResponse> {
  const callback = (acc: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => {
    if (!acc || !acc.getIsReadyOrError()) return undefined;
    const pObjects = parseFinalPObjectCollection(acc, false, "", [outputName]);
    const pColumns = Object.entries(pObjects).map(([, obj]) => {
      if (!isPColumn(obj)) throw new Error(`not a PColumn (kind = ${obj.spec.kind})`);
      return obj;
    });
    const { key, unref } = driverKit.pFrameDriver.createPFrame(pColumns);
    ctx.addOnDestroy(unref);
    return key;
  };
  const handle = await getOutput(result, outputName, callback, timeout);

  const pColumns = await driverKit.pFrameDriver.listColumns(handle);
  const pTable = await driverKit.pFrameDriver.calculateTableData(
    handle,
    {
      src: {
        type: "full",
        entries: pColumns.map((col) => ({
          type: "column",
          column: col.columnId,
        })),
      },
      filters: [],
      sorting: [],
    },
    undefined,
  );
  return pTable;
}

async function getOutput<T, O extends string>(
  result: TestWorkflowResults | TestRenderResults<O>,
  outputName: O,
  callback: (acc: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => T,
  timeout: number,
): Promise<NonNullable<Awaited<UnwrapComputables<T>>>> {
  const computable =
    result instanceof TestWorkflowResults
      ? result.output(outputName, callback)
      : result.computeOutput(outputName, callback);
  const value = await awaitStableState(computable, timeout);
  assert(value);
  return value;
}
