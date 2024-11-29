import { blockSpec as downloadFileSpec } from '@milaboratories/milaboratories.test-download-file';
import { platforma as downloadFileModel } from '@milaboratories/milaboratories.test-download-file.model';
import { blockSpec as readLogsSpec } from '@milaboratories/milaboratories.test-read-logs';
import { platforma as readLogsModel } from '@milaboratories/milaboratories.test-read-logs.model';
import { blockSpec as uploadFileSpec } from '@milaboratories/milaboratories.test-upload-file';
import { platforma as uploadFileModel } from '@milaboratories/milaboratories.test-upload-file.model';
import {
  ImportFileHandle,
  InferBlockState,
  LocalBlobHandleAndSize,
  MiddleLayer,
  RemoteBlobHandleAndSize
} from '@milaboratories/pl-middle-layer';
import { awaitStableState, blockTest } from '@platforma-sdk/test';
import path from 'path';

blockTest(
  'should create download-file block, render it and gets outputs from its config',
  async ({ rawPrj: project, ml, helpers, expect }) => {
    const blockId = await project.addBlock('DownloadFile', downloadFileSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      'answer_to_the_ultimate_question.txt'
    );

    await project.setBlockArgs(blockId, { inputHandle });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000
      )) as InferBlockState<typeof downloadFileModel>;
      // console.dir(state, { depth: 5 });

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();
      console.dir(blockFrontend, { depth: 5 });

      const outputs = state.outputs;

      if (outputs.contentAsString.ok) {
        expect(outputs.contentAsString.value).toStrictEqual('42\n');
        expect((outputs.contentAsJson as any).value).toStrictEqual(42);
        const localBlob = (outputs.downloadedBlobContent as any).value as LocalBlobHandleAndSize;
        const remoteBlob = (outputs.onDemandBlobContent as any).value as RemoteBlobHandleAndSize;

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(localBlob.handle)).toString('utf-8')
        ).toEqual('42\n');

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(remoteBlob.handle)).toString('utf-8')
        ).toEqual('42\n');

        return;
      }
    }
  }
);

blockTest(
  'should create upload-file block, render it and upload a file to pl server',
  async ({ rawPrj: project, ml, helpers, expect }) => {
    const blockId = await project.addBlock('UpdateFile', uploadFileSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      'another_answer_to_the_ultimate_question.txt'
    );

    await project.setBlockArgs(blockId, { inputHandle });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000
      )) as InferBlockState<typeof uploadFileModel>;

      // console.dir(state, { depth: 5 });

      const outputs = state.outputs;
      if (outputs.handle.ok && outputs.handle.value != undefined) {
        expect(outputs.handle.value.isUpload).toBeTruthy();
        expect(outputs.handle.value.done).toBeTruthy();
        return;
      }
    }
  }
);

blockTest(
  'should create read-logs block, render it and read logs from a file',
  async ({ rawPrj: project, ml, helpers, expect }) => {
    const blockId = await project.addBlock('ReadLogs', readLogsSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      'maybe_the_number_of_lines_is_the_answer.txt'
    );

    await project.setBlockArgs(blockId, {
      inputHandle,
      // args are from here:
      // https://github.com/milaboratory/sleep/blob/3c046cdcc504b63f1a6e592a4aa87ee773a94d72/read-file-to-stdout-with-sleep.go#L24
      readFileWithSleepArgs: 'PREFIX,100,1000'
    });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000
      )) as InferBlockState<typeof readLogsModel>;

      // console.dir(state, { depth: 5 });
      const outputs = state.outputs;

      if (outputs.lastLogs.ok && outputs.lastLogs.value != undefined) {
        expect((outputs.progressLog as any).value).toContain('PREFIX');
        expect((outputs.progressLog as any).value).toContain('bytes read');
        expect((outputs.lastLogs as any).value.split('\n').length).toEqual(10 + 1); // 11 because the last element is empty
        return;
      }
    }
  },
  // The timeout is higher here because pl - core must download a software for this test.
  { timeout: 20000 }
);

async function lsDriverGetFileHandleFromAssets(
  ml: MiddleLayer,
  expect: any,
  fName: string
): Promise<ImportFileHandle> {
  const storages = await ml.driverKit.lsDriver.getStorageList();

  const local = storages.find((s) => s.name == 'local');
  expect(local).not.toBeUndefined();

  const fileDir = path.resolve(__dirname, '..', '..', '..', 'assets');
  const files = await ml.driverKit.lsDriver.listFiles(local!.handle, fileDir);

  const ourFile = files.entries.find((f) => f.name == fName);
  expect(ourFile).not.toBeUndefined();
  expect(ourFile?.type).toBe('file');

  return (ourFile as any).handle;
}
