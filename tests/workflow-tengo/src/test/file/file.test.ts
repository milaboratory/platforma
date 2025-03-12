import type {
  ImportFileHandle,
  MiddleLayerDriverKit } from '@milaboratories/pl-middle-layer';
import {
  Pl,
} from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';
import path from 'path';
import * as env from '../env';

type TestInput = {
  name: string;
  handleProvider: (
    driverKit: MiddleLayerDriverKit
  ) => Promise<ImportFileHandle>;
};

const cases: TestInput[] = [
  {
    name: 'upload',
    handleProvider: async (driverKit) => {
      return await driverKit.lsDriver.getLocalFileHandle(
        path.resolve('../../assets/answer_to_the_ultimate_question.txt'),
      );
    },
  },
  {
    name: 'import',
    handleProvider: async (driverKit) => {
      const storages = await driverKit.lsDriver.getStorageList();
      const library = storages.find((s) => s.name == env.libraryStorage);
      if (library === undefined) throw new Error('Library not found');
      const files = await driverKit.lsDriver.listFiles(library!.handle, '');
      const ourFile = files.entries.find(
        (f) => f.name == 'answer_to_the_ultimate_question.txt',
      );
      if (ourFile === undefined)
        throw new Error('Test file not found in the library');
      if (ourFile.type !== 'file') throw new Error('Dir');
      return ourFile.handle;
    },
  },
];

tplTest.for(cases)(
  'file import test: $name',
  async ({ handleProvider }, { helper, expect, driverKit }) => {
    const importHandle = await handleProvider(driverKit);
    const result = await helper.renderTemplate(
      false,
      'test.file.simple1',
      ['file', 'progress'],
      (tx) => ({
        importHandle: tx.createValue(
          Pl.JsonObject,
          JSON.stringify(importHandle),
        ),
      }),
    );
    const progress = result
      .computeOutput('progress', (a, ctx) => {
        if (a === undefined) return undefined;
        return driverKit.uploadDriver.getProgressId(a.persist(), ctx);
      })
      .withPreCalculatedValueTree();
    const file = result
      .computeOutput('file', (a, ctx) => {
        if (a === undefined) return undefined;
        return driverKit.blobDriver.getOnDemandBlob(a.persist(), ctx);
      })
      .withPreCalculatedValueTree();

    const progressStableValue = await progress.awaitStableValue();

    expect(progressStableValue).toBeDefined();
    expect(progressStableValue).toMatchObject({ done: true });
    const fileStableValue = await file.awaitStableValue();
    expect(fileStableValue).toBeDefined();
    const fileContent = Buffer.from(
      await driverKit.blobDriver.getContent(fileStableValue!.handle),
    ).toString();
    expect(fileContent).toEqual('42\n');
  },
);
