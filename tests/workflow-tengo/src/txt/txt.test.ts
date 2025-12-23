import type {
  ImportFileHandle,
  MiddleLayerDriverKit,
} from '@milaboratories/pl-middle-layer';
import {
  Pl,
} from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';
import path from 'path';
import * as env from '../env';
import { getLongTestTimeout } from '@milaboratories/test-helpers';
import { vi } from 'vitest';

const TIMEOUT = getLongTestTimeout(60_000);

vi.setConfig({
  testTimeout: TIMEOUT,
});

type TestInput = {
  name: string;
  fileName: string;
  headOptions: { lines: number; maxBytes?: number };
  expectedContent: string;
  handleProvider: (
    driverKit: MiddleLayerDriverKit
  ) => Promise<ImportFileHandle>;
};

const cases: TestInput[] = [
  {
    name: 'upload-first-5-lines',
    fileName: 'maybe_the_number_of_lines_is_the_answer.txt',
    headOptions: { lines: 5 },
    expectedContent: '1 line\n2 line\n3 line\n4 line\n5 line\n',
    handleProvider: async (driverKit) => {
      return await driverKit.lsDriver.getLocalFileHandle(
        path.resolve('../../assets/maybe_the_number_of_lines_is_the_answer.txt'),
      );
    },
  },
  {
    name: 'upload-first-10-lines-with-maxbytes',
    fileName: 'maybe_the_number_of_lines_is_the_answer.txt',
    headOptions: { lines: 10, maxBytes: 1000 },
    expectedContent: '1 line\n2 line\n3 line\n4 line\n5 line\n6 line\n7 line\n8 line\n9 line\n10 line\n',
    handleProvider: async (driverKit) => {
      return await driverKit.lsDriver.getLocalFileHandle(
        path.resolve('../../assets/maybe_the_number_of_lines_is_the_answer.txt'),
      );
    },
  },
  {
    name: 'upload-single-line-small-file-with-no-new-line',
    fileName: 'answer_to_the_ultimate_question.txt',
    headOptions: { lines: 1 },
    expectedContent: '42',
    handleProvider: async (driverKit) => {
      return await driverKit.lsDriver.getLocalFileHandle(
        path.resolve('../../assets/answer_to_the_ultimate_question.txt'),
      );
    },
  },
  {
    name: 'import-first-3-lines',
    fileName: 'maybe_the_number_of_lines_is_the_answer.txt',
    headOptions: { lines: 3 },
    expectedContent: '1 line\n2 line\n3 line\n',
    handleProvider: async (driverKit) => {
      const storages = await driverKit.lsDriver.getStorageList();
      const library = storages.find((s) => s.name == env.libraryStorage);
      if (library === undefined) throw new Error(`Library '${env.libraryStorage}' not found`);
      const files = await driverKit.lsDriver.listFiles(library!.handle, '');
      const ourFile = files.entries.find(
        (f) => f.name == 'maybe_the_number_of_lines_is_the_answer.txt',
      );
      if (ourFile === undefined)
        throw new Error('Test file not found in the library');
      if (ourFile.type !== 'file') throw new Error('Dir');
      return ourFile.handle;
    },
  },
];

tplTest.concurrent.for(cases)(
  'txt.head test: $name',
  async ({ handleProvider, headOptions, expectedContent }, { helper, expect, driverKit }) => {
    const importHandle = await handleProvider(driverKit);
    const result = await helper.renderTemplate(
      false,
      'txt.head',
      ['result', 'progress'],
      (tx) => ({
        importHandle: tx.createValue(
          Pl.JsonObject,
          JSON.stringify(importHandle),
        ),
        headOptions: tx.createValue(
          Pl.JsonObject,
          JSON.stringify(headOptions),
        ),
      }),
    );

    const progress = result
      .computeOutput('progress', (a, ctx) => {
        if (a === undefined) return undefined;
        return driverKit.uploadDriver.getProgressId(a.persist(), ctx);
      })
      .withPreCalculatedValueTree();

    const txtResult = result
      .computeOutput('result', (a) => {
        if (a === undefined) return undefined;
        return a.getDataAsString();
      })
      .withPreCalculatedValueTree();

    const progressStableValue = await progress.awaitStableValue();
    expect(progressStableValue).toBeDefined();
    expect(progressStableValue).toMatchObject({ done: true });

    const txtStableValue = await txtResult.awaitStableValue();
    expect(txtStableValue).toBeDefined();
    expect(txtStableValue).toEqual(expectedContent);
  },
);

// Test error case when maxBytes limit is exceeded
tplTest.concurrent(
  'txt.head error test: maxBytes exceeded',
  async ({ helper, expect, driverKit }) => {
    const importHandle = await driverKit.lsDriver.getLocalFileHandle(
      path.resolve('../../assets/maybe_the_number_of_lines_is_the_answer.txt'),
    );

    // Try to extract 20 lines but limit to only 50 bytes (should fail)
    await expect(async () => {
      const result = await helper.renderTemplate(
        false,
        'txt.head',
        ['result', 'progress'],
        (tx) => ({
          importHandle: tx.createValue(
            Pl.JsonObject,
            JSON.stringify(importHandle),
          ),
          headOptions: tx.createValue(
            Pl.JsonObject,
            JSON.stringify({ lines: 20, maxBytes: 50 }),
          ),
        }),
      );
      const progress = result
        .computeOutput('progress', (a, ctx) => {
          if (a === undefined) return undefined;
          return driverKit.uploadDriver.getProgressId(a.persist(), ctx);
        })
        .withPreCalculatedValueTree();

      const txtResult = result
        .computeOutput('result', (a) => {
          if (a === undefined) return undefined;
          return a.getDataAsString();
        })
        .withPreCalculatedValueTree();

      const progressStableValue = await progress.awaitStableValue();
      expect(progressStableValue).toBeDefined();
      expect(progressStableValue).toMatchObject({ done: true });

      const txtStableValue = await txtResult.awaitStableValue();
      expect(txtStableValue).toBeDefined();
    },
    ).rejects.toThrow(/would exceed.*byte limit/);
  },
);
