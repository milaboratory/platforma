import { Pl } from '@milaboratory/pl-middle-layer';
import { tplTest } from '@milaboratory/sdk-test';
import * as env from '../env';

tplTest(
  'should run bash from the template, echo a string to stdout and returns a value resource',
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'test.exec.run_echo_to_value',
      ['main'],
      (tx) => ({})
    );
    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString()
    );

    expect(await mainResult.awaitStableValue()).eq('Hello from bash\n');
  }
);

tplTest(
  'should run bash from the template, echo a string to stdout and returns a stream log',
  async ({ driverKit, helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'test.exec.run_echo_to_stream',
      ['main'],
      (tx) => ({})
    );

    const mainResult = result.computeOutput('main', (a) => {
      const entry = a?.persist();
      if (entry === undefined) return;
      return driverKit.logDriver.getLastLogs(entry, 10);
    });

    expect(await mainResult.awaitStableValue()).eq('Hello from bash\n');
  }
);

tplTest(
  'should run bash from the template, cat a file from a directory and returns its content as a value resource',
  async ({ driverKit, helper, expect }) => {
    const storages = await driverKit.lsDriver.getStorageList();
    const library = storages.find((s) => s.name == env.libraryStorage);
    expect(library).toBeDefined();
    const files = await driverKit.lsDriver.listFiles(library!.handle, '');
    const ourFile = files.entries.find(
      (f) => f.name == 'answer_to_the_ultimate_question.txt'
    );
    expect(ourFile).toBeDefined();
    expect(ourFile?.type).toBe('file');

    const result = await helper.renderTemplate(
      false,
      'test.exec.run_cat_on_file',
      ['main'],
      (tx) => ({
        file: tx.createValue(
          Pl.JsonObject,
          JSON.stringify((ourFile as any).handle)
        )
      })
    );

    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString()
    );

    expect(await mainResult.awaitStableValue()).eq('42');
  }
);
