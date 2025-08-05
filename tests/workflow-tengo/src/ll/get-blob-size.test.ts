import { Pl } from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';
import * as env from '../test/env';

tplTest.concurrent(
  'should get blob size from file in library storage',
  async ({ driverKit, helper, expect }) => {
    const storages = await driverKit.lsDriver.getStorageList();
    const library = storages.find((s) => s.name == env.libraryStorage);
    expect(library).toBeDefined();
    const files = await driverKit.lsDriver.listFiles(library!.handle, '');
    const ourFile = files.entries.find(
      (f) => f.name == 'answer_to_the_ultimate_question.txt',
    );
    expect(ourFile).toBeDefined();
    expect(ourFile?.type).toBe('file');

    const result = await helper.renderTemplate(
      false,
      'll.test-get-blob-size',
      ['size'],
      (tx) => ({
        file: tx.createValue(
          Pl.JsonObject,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          JSON.stringify((ourFile as any).handle),
        ),
      }),
    );

    // Check that the function is called and returns the correct size
    const sizeResult = result.computeOutput('size', (a) => a?.getDataAsJson());
    const size = await sizeResult.awaitStableValue();
    expect(size).toBe(2); // '42' has 2 characters
  },
);
