import path from 'path';
import * as fsp from 'node:fs/promises';
import {
  ImportFileHandleUpload,
  MiddleLayer,
  Project
} from '@milaboratory/pl-middle-layer';
import { plTest } from './test-pl';

async function awaitBlockDone(
  prj: Project,
  blockId: string,
  timeout: number = 2000
) {
  const abortSignal = AbortSignal.timeout(timeout);
  const overview = prj.overview;
  const state = prj.getBlockState(blockId);
  while (true) {
    const overviewSnapshot = (await overview.getValue())!;
    const blockOverview = overviewSnapshot.blocks.find((b) => b.id == blockId);
    if (blockOverview === undefined)
      throw new Error(`Blocks not found: ${blockId}`);
    if (blockOverview.outputErrors) return;
    if (blockOverview.calculationStatus === 'Done') return;
    try {
      await overview.awaitChange(abortSignal);
    } catch (e: any) {
      console.dir(await state.getValue(), { depth: 5 });
      throw new Error('Aborted.', { cause: e });
    }
  }
}

export interface RawHelpers {
  awaitBlockDone(blockId: string, timeout?: number): Promise<void>;
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
      async getLocalFileHandle(localPath) {
        return await ml.internalDriverKit.lsDriver.getLocalFileHandle(
          path.resolve(localPath)
        );
      }
    });
  }
});
