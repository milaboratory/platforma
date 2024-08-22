import { Pl } from '@milaboratory/pl-middle-layer';
import { tplTest } from '@milaboratory/sdk-test';
import * as env from '../../test/env';

tplTest(
  'run-hello-world-go',
  async ({ helper, expect }) => {
    const helloText = "Hello from go!"

    const result = await helper.renderTemplate(
      false,
      'exec.test.run_hello_go',
      ['main'],
      (tx) => ({
        text: tx.createValue(Pl.JsonObject, JSON.stringify(helloText))
      })
    );
    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString()
    );

    expect(await mainResult.awaitStableValue()).eq(helloText + '\n');
  }
);

tplTest(
  'run-fake-java-script',
  async ({ helper, expect }) => {
    const customTestText = "hello from fake java"

    const result = await helper.renderTemplate(
      false,
      'exec.test.run_fake_java',
      ['main'],
      (tx) => ({
        text: tx.createValue(Pl.JsonObject, JSON.stringify(customTestText))
      })
    );
    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString()
    );

    const output = (await mainResult.awaitStableValue())
    expect(output).toBeDefined()

    const lines = output!.split("\n")
    expect(lines).length(4)
    expect(lines[0]).toBe("got 'java' by dependency")
    if (!lines[1].startsWith("pkg=/")) throw new Error(`line[1] not starts with pkg=/`)
    if (!lines[2].startsWith("java=/")) throw new Error(`line[2] not starts with java=/`)
    expect(lines[3]).toBe(customTestText)
  }
);

tplTest(
  'should run bash from the template, echo a string to stdout and returns a value resource',
  async ({ helper, expect }) => {
    const helloText = "Hello from bash"

    const result = await helper.renderTemplate(
      false,
      'test.exec.run_echo_to_value',
      ['main'],
      (tx) => ({
        text: tx.createValue(Pl.JsonObject, JSON.stringify(helloText))
      })
    );
    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString()
    );

    expect(await mainResult.awaitStableValue()).eq(helloText);
  }
);

tplTest(
  'should run bash from the template, echo a string to stdout and returns a stream log',
  async ({ driverKit, helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run_echo_to_stream',
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
      'exec.test.run_cat_on_file',
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

tplTest(
  'should run bash from the template, cat a file created by content and gets a content from stdout',
  async ({ driverKit, helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run_cat_on_value',
      ['main'],
      (tx) => ({})
    );

    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString()
    );

    expect(await mainResult.awaitStableValue()).eq(
      '>asd\nATGCTA\n>asdasd\nASD\n>asdasd\nD\n>asdasd\nAD\n'
    );
  }
);

tplTest(
  'should save file set by regex',
  async ({ driverKit, helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run_and_save_file_set',
      ['p', 'x', 'all'],
      (tx) => ({})
    );

    const p = await result
      .computeOutput('p', (p) => p?.listInputFields())
      .awaitStableValue();
    const x = await result
      .computeOutput('x', (x) => x?.listInputFields())
      .awaitStableValue();
    const all = await result
      .computeOutput('all', (all) => all?.listInputFields())
      .awaitStableValue();

    expect(p?.sort()).toEqual(['p1', 'p2', 'p3', 'p4'].sort());
    expect(x?.sort()).toEqual(['x1', 'x2'].sort());
    //expect(all?.sort()).toContainAll(['p1', 'p2', 'p3', 'p4', 'x1', 'x2'].sort());
  }
);

tplTest(
  'should run workdir processor',
  async ({ driverKit, helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run_with_wd_processor',
      ['p'],
      (tx) => ({})
    );

    const p = await result
      .computeOutput('p', (p) => p?.listInputFields())
      .awaitStableValue();

    const data = await result
      .computeOutput('p', (p) => p?.traverse('data')?.getDataAsString())
      .awaitStableValue();

    // const file = await result
    //   .computeOutput('p', (p) => driverKit.blobDriver.get p?.traverse('file')?.)
    //   .awaitStableValue();

    expect(data).eq('text1\n');
  }
);
