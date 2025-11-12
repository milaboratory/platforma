import {
  isPColumn,
  parseFinalPObjectCollection,
  type CalculateTableDataResponse,
  type MiddleLayerDriverKit,
} from '@milaboratories/pl-middle-layer';
import {
  awaitStableState,
  TestWorkflowResults,
  type TestRenderResults,
} from '@platforma-sdk/test';
import type { PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import type { ComputableCtx, UnwrapComputables } from '@milaboratories/computable';
import { getTestTimeout } from '@milaboratories/test-helpers';
import { assert } from 'vitest';

export const Timeout = getTestTimeout(60_000);

async function getOutput<T, O extends string>(
  result: TestWorkflowResults | TestRenderResults<O>,
  outputName: O,
  callback: (acc: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => T,
  timeout = Timeout,
): Promise<NonNullable<Awaited<UnwrapComputables<T>>>> {
  const computable = result instanceof TestWorkflowResults
    ? result.output(outputName, callback)
    : result.computeOutput(outputName, callback);
  const value = await awaitStableState(computable, timeout);
  assert(value);
  return value;
}

export async function getFileContent<O extends string>(
  result: TestWorkflowResults | TestRenderResults<O>,
  outputName: O,
  driverKit: MiddleLayerDriverKit,
  timeout = Timeout,
): Promise<string> {
  const callback = (fileHandle: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => {
    if (!fileHandle) return undefined;
    return driverKit.blobDriver.getOnDemandBlob(fileHandle.persist(), ctx).handle;
  };
  const handle = await getOutput(result, outputName, callback, timeout);

  const content = await driverKit.blobDriver.getContent(handle);
  return content.toString();
}

export async function getTableData<O extends string>(
  result: TestWorkflowResults | TestRenderResults<O>,
  outputName: O,
  driverKit: MiddleLayerDriverKit,
  timeout = Timeout,
): Promise<CalculateTableDataResponse> {
  const callback = (acc: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => {
    if (!acc || !acc.getIsReadyOrError()) return undefined;
    const pObjects = parseFinalPObjectCollection(acc, false, '', [outputName]);
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
  const pTable = await driverKit.pFrameDriver.calculateTableData(handle, {
    src: {
      type: 'full',
      entries: pColumns.map((col) => ({
        type: 'column',
        column: col.columnId,
      })),
    },
    filters: [],
    sorting: [],
  }, undefined);
  return pTable;
}
