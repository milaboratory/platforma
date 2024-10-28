import { tplTest } from '@platforma-sdk/test';
import * as env from '../../test/env';
import {
  Pl
} from '@milaboratories/pl-middle-layer';

tplTest('unpack-archive', async ({ helper, expect, driverKit }) => {
  const importHandle = async (driverKit) => {
    const storages = await driverKit.lsDriver.getStorageList();
    const library = storages.find((s) => s.name == env.libraryStorage);
    if (library === undefined) throw new Error('Library not found');
    const files = await driverKit.lsDriver.listFiles(library!.handle, '');
    const ourFile = files.entries.find((f) => f.name == 'archive.zip');
    if (ourFile === undefined) throw new Error('Test archive not found in the library');
    if (ourFile.type !== 'file')
      throw new Error(`Import target must be a file, not '${ourFile.type}'`);
    return ourFile.handle;
  };

  const archiveHandle = await importHandle(driverKit);

  const result = await helper.renderTemplate(
    false,
    'exec.test.wd.unarchive',
    ['fileContent'],
    (tx) => ({
      importHandle: tx.createValue(Pl.JsonObject, JSON.stringify(archiveHandle))
    })
  );

  const fileContentFuture = result.computeOutput('fileContent', (a) => a?.getData().toString());
  const fileContent = await fileContentFuture.awaitStableValue();

  expect(fileContent).toEqual("42")
});
