import path from 'path';
import * as fsp from 'node:fs/promises';
import {
  BlockModel,
  BlockState,
  ImportFileHandleUpload,
  InferBlockState,
  MiddleLayer,
  Platforma,
  Project
} from '@milaboratory/pl-middle-layer';
import { plTest } from './test-pl';
import { awaitStableState } from './util';

export type AwaitBlockDoneOps = {
  timeout?: number | AbortSignal;
  ignoreBlockError?: boolean;
};

export const DEFAULT_AWAIT_BLOCK_DONE_TIMEOUT = 2000;

async function awaitBlockDone(
  prj: Project,
  blockId: string,
  timeoutOrOps?: number | AbortSignal | AwaitBlockDoneOps
) {
  let ops: AwaitBlockDoneOps = { timeout: DEFAULT_AWAIT_BLOCK_DONE_TIMEOUT };
  if (timeoutOrOps !== undefined) {
    if (typeof timeoutOrOps === 'object') ops = { ...ops, ...timeoutOrOps };
    else ops.timeout = timeoutOrOps;
  }
  const abortSignal =
    typeof ops.timeout === 'number'
      ? AbortSignal.timeout(ops.timeout)
      : ops.timeout;
  const overview = prj.overview;
  const state = prj.getBlockState(blockId);
  while (true) {
    const overviewSnapshot = (await overview.getValue())!;
    const blockOverview = overviewSnapshot.blocks.find((b) => b.id == blockId);
    if (blockOverview === undefined)
      throw new Error(`Blocks not found: ${blockId}`);
    if (blockOverview.outputErrors) {
      if (ops.ignoreBlockError) return;
      else {
        let errorMessage = blockOverview.outputsError;
        if (errorMessage === undefined)
          errorMessage = blockOverview.exportsError;
        throw new Error('Block error: ' + (errorMessage ?? 'no message'));
      }
    }
    if (blockOverview.calculationStatus === 'Done') return;
    if (blockOverview.calculationStatus !== 'Running')
      throw new Error(
        `Unexpected block status, block not calculating anything at the moment: ${blockOverview.calculationStatus}`
      );
    try {
      await overview.awaitChange(abortSignal);
    } catch (e: any) {
      console.dir(blockOverview, { depth: 5 });
      console.dir(await state.getValue(), { depth: 5 });
      throw new Error('Aborted while awaiting block done.', { cause: e });
    }
  }
}

export interface RawHelpers {
  awaitBlockDone(
    blockId: string,
    timeout?: number | AbortSignal
  ): Promise<void>;
  awaitBlockDoneAndGetStableBlockState<Pl extends Platforma>(
    blockId: string,
    timeout?: number | AbortSignal
  ): Promise<InferBlockState<Pl>>;
  getLocalFileHandle(localPath: string): Promise<ImportFileHandleUpload>;
}

export const blockTest = plTest.extend<{
  ml: MiddleLayer;
  rawPrj: Project;
  helpers: RawHelpers;
}>({
  ml: async ({ pl, tmpFolder }, use) => {
    const frontendFolder = path.join(tmpFolder, 'frontend');
    const downloadFolder = path.join(tmpFolder, 'download');
    await fsp.mkdir(frontendFolder, { recursive: true });
    await fsp.mkdir(downloadFolder, { recursive: true });

    const ml = await MiddleLayer.init(pl, {
      defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
      devBlockUpdateRecheckInterval: 300,
      frontendDownloadPath: path.resolve(frontendFolder),
      localSecret: MiddleLayer.generateLocalSecret(),
      blobDownloadPath: path.resolve(downloadFolder),
      localStorageNameToPath: { local: '' }
    });

    await use(ml);

    await ml.close();
  },
  rawPrj: async ({ ml }, use) => {
    const pRid1 = await ml.createProject(
      { label: 'Test Project' },
      'test_project'
    );
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);
    await use(prj);
    ml.closeProject(pRid1);
  },
  helpers: async ({ ml, rawPrj }, use) => {
    await use({
      async awaitBlockDone(blockId, timeout) {
        await awaitBlockDone(rawPrj, blockId, timeout);
      },
      awaitBlockDoneAndGetStableBlockState: async <Pl extends Platforma>(
        blockId: string,
        timeout?: number | AbortSignal
      ) => {
        const abortSignal =
          typeof timeout === 'number' ? AbortSignal.timeout(timeout) : timeout;
        await awaitBlockDone(rawPrj, blockId, abortSignal);
        return (await awaitStableState(
          rawPrj.getBlockState(blockId),
          abortSignal
        )) as InferBlockState<Pl>;
      },
      async getLocalFileHandle(localPath) {
        return await ml.internalDriverKit.lsDriver.getLocalFileHandle(
          path.resolve(localPath)
        );
      }
    });
  }
});
