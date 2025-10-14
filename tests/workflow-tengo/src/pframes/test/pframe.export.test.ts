import { Annotation, type DriverKit, Pl, stringifyJson } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';
import * as env from '../../test/env';
import { getTestTimeout } from '@milaboratories/test-utils';
import { vi } from 'vitest';

const TIMEOUT = getTestTimeout(40_000);

vi.setConfig({
  testTimeout: TIMEOUT,
});

// pfconv spec
const baseSpec = {
  kind: 'File',
  name: 'ax1',

  domain: {},
  annotations: {},
};

tplTest.concurrent(
  'should export files for p-frame without skipExportForUI annotation',
  async ({ helper, expect, driverKit }) => {
    const spec = baseSpec;
    const fileHandle = await importFile(driverKit);

    const result = await helper.renderTemplate(
      true,
      'pframes.test.pframe.export',
      ['exported'],
      (tx) => {
        return {
          spec: tx.createValue(Pl.JsonObject, stringifyJson(spec)),
          fileHandle: tx.createValue(Pl.JsonObject, stringifyJson(fileHandle)),
        };
      },
    );

    const exported = result.computeOutput('exported', (a, _ctx) => {
      const data = a?.traverseOrError('val1.data');
      if (!data?.ok) return undefined;

      return data.value.resourceInfo;
    });

    const finalResult = await awaitStableState(exported, TIMEOUT);

    expect(finalResult).toBeDefined();
    expect(finalResult?.type.version).toBe('1');
    expect(finalResult?.type.name).toMatch(/Blob\/.+/);
  },
);

tplTest.concurrent(
  'should not export files for p-frame with hideDataFromUi annotation',
  async ({ helper, expect, driverKit }) => {
    const spec = { ...baseSpec, annotations: { [Annotation.HideDataFromUi]: stringifyJson(true) } satisfies Annotation };
    const fileHandle = await importFile(driverKit);

    const result = await helper.renderTemplate(
      true,
      'pframes.test.pframe.export',
      ['exported'],
      (tx) => {
        return {
          spec: tx.createValue(Pl.JsonObject, stringifyJson(spec)),
          fileHandle: tx.createValue(Pl.JsonObject, stringifyJson(fileHandle)),
        };
      },
    );

    const exported = result.computeOutput('exported', (a, _ctx) => {
      const data = a?.traverseOrError('val1.data');
      if (!data?.ok) return undefined;

      return data.value.resourceInfo;
    });

    const finalResult = await awaitStableState(exported, TIMEOUT);

    expect(finalResult).toBeUndefined();
  },
);

async function importFile(driverKit: DriverKit) {
  const storages = await driverKit.lsDriver.getStorageList();
  const library = storages.find((s) => s.name === env.libraryStorage);
  if (library === undefined) throw new Error(`Library '${env.libraryStorage}' not found`);
  const files = await driverKit.lsDriver.listFiles(library.handle, '');
  const ourFile = files.entries.find(
    (f) => f.name === 'answer_to_the_ultimate_question.txt',
  );
  if (ourFile === undefined)
    throw new Error('Test file not found in the library');
  if (ourFile.type !== 'file') throw new Error('Dir');

  return ourFile.handle;
}
