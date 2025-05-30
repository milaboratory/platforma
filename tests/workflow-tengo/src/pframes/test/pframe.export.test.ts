import { type DriverKit, Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';
import * as env from '../../test/env';

// pfconv spec
const baseSpec = {
  kind: 'File',
  name: 'ax1',

  domain: {},
  annotations: {},
};

tplTest('should export files for p-frame without skipExportForUI annotation', { timeout: 40000 },
  async ({ helper, expect, driverKit }) => {
    const spec = baseSpec;
    const fileHandle = await importFile(driverKit);

    const result = await helper.renderTemplate(
      true,
      'pframes.test.pframe.export',
      ['exported'],
      (tx) => {
        return {
          spec: tx.createValue(Pl.JsonObject, JSON.stringify(spec)),
          fileHandle: tx.createValue(Pl.JsonObject, JSON.stringify(fileHandle)),
        };
      },
    );

    const exported = result.computeOutput('exported', (a, _ctx) => {
      const data = a?.traverseOrError('val1.data');
      if (!data?.ok) return undefined;

      return data.value.resourceInfo;
    });

    const finalResult = await awaitStableState(exported, 40000);
    console.log(finalResult);

    expect(finalResult?.type.version).toBe('1');
    expect(finalResult?.type.name).toMatch(/Blob\/.+/);
  },
);

tplTest('should not export files for p-frame with hideDataFromUi annotation', { timeout: 40000 },
  async ({ helper, expect, driverKit }) => {
    const spec = { ...baseSpec, annotations: { 'pl7.app/hideDataFromUi': 'true' } };
    const fileHandle = await importFile(driverKit);

    const result = await helper.renderTemplate(
      true,
      'pframes.test.pframe.export',
      ['exported'],
      (tx) => {
        return {
          spec: tx.createValue(Pl.JsonObject, JSON.stringify(spec)),
          fileHandle: tx.createValue(Pl.JsonObject, JSON.stringify(fileHandle)),
        };
      },
    );

    const exported = result.computeOutput('exported', (a, _ctx) => {
      const data = a?.traverseOrError('val1.data');
      if (!data?.ok) return undefined;

      return data.value.resourceInfo;
    });

    const finalResult = await awaitStableState(exported, 40000);
    console.log(finalResult);

    expect(finalResult).toBeUndefined();
  });

async function importFile(driverKit: DriverKit) {
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
}
