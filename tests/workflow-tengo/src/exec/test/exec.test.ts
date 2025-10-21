/* eslint-disable @typescript-eslint/no-unused-vars */
import { Pl } from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';
import * as env from '../../test/env';

/*
 * Checks, that default limits are applied based
 * on queue block developer choses when bulding the command
 */
tplTest.concurrent(
  'run-hello-world-go',
  async ({ helper, expect }) => {
    const helloText = 'Hello from go!';

    const result = await helper.renderTemplate(
      false,
      'exec.test.run.hello_go',
      ['main'],
      (tx) => ({
        text: tx.createValue(Pl.JsonObject, JSON.stringify(helloText)),
      }),
    );
    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString(),
    );

    expect(await mainResult.awaitStableValue()).eq(helloText + '\n');
  },
);

tplTest.concurrent(
  'run-empty-conda-env',
  async ({ helper, expect }) => {
    const helloText = 'Hello from go!';

    const result = await helper.renderTemplate(
      false,
      'exec.test.run.conda_empty_run',
      ['main'],
      (tx) => ({
        text: tx.createValue(Pl.JsonObject, JSON.stringify(helloText)),
      }),
    );
    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString(),
    );

    expect(await mainResult.awaitStableValue()).eq(helloText + '\n');
  },
);

/*
 * Checks, that custom limits applied to the command do not
 * break anything it its execution. We can't check what _controller_ saw,
 * but we at least know SDK does not get broken when custom limits are applied.
 */
tplTest.concurrent.for([
  { cpuLimit: 1, ramLimit: '10MiB' },
  { cpuLimit: 2, ramLimit: '10mib' },
  { cpuLimit: 1, ramLimit: '10mb' },
  { cpuLimit: 1, ramLimit: '10m' },
  { cpuLimit: 1, ramLimit: '10M' },
  { cpuLimit: 1, ramLimit: '1024k' },
  { cpuLimit: 1, ramLimit: '1024kb' },
  { cpuLimit: 1, ramLimit: '1024Kb' },
  { cpuLimit: 1, ramLimit: '1024kB' },
  { cpuLimit: 1, ramLimit: '1024Kib' },
  { cpuLimit: 1, ramLimit: '1024KiB' },
  { cpuLimit: 1, ramLimit: '1024kiB' },
  { cpuLimit: 1, ramLimit: 1048576 },
])(
  'run-hello-world-go (limits) CPU=$cpuLimit, RAM=$ramLimit',
  async ({ cpuLimit, ramLimit }, { helper, expect }) => {
    const helloText = 'Hello from go!';

    const result = await helper.renderTemplate(
      false,
      'exec.test.run.hello_go_limits',
      ['main'],
      (tx) => ({
        text: tx.createValue(Pl.JsonObject, JSON.stringify(helloText)),
        cpu: tx.createValue(Pl.JsonObject, JSON.stringify(cpuLimit)),
        ram: tx.createValue(Pl.JsonObject, JSON.stringify(ramLimit)),
      }),
    );
    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString(),
    );

    expect(await mainResult.awaitStableValue()).eq(helloText + '\n');
  },
);

// tplTest(
//   'use-asset-in-exec',
//   async ({ helper, expect }) => {
//     const helloText = "file2.txt content"

//     const result = await helper.renderTemplate(
//       false,
//       'exec.test.run.use_asset',
//       ['main'],
//       (tx) => ({
//         text: tx.createValue(Pl.JsonObject, JSON.stringify(helloText))
//       })
//     );
//     const mainResult = result.computeOutput('main', (a) =>
//       a?.getDataAsString()
//     );

//     expect(await mainResult.awaitStableValue()).eq(helloText + '\n');
//   }
// );

tplTest.concurrent(
  'should run bash from the template, echo a string to stdout and returns a value resource',
  async ({ helper, expect }) => {
    const helloText = 'Hello from bash';

    const result = await helper.renderTemplate(
      false,
      'exec.test.run.echo_to_value',
      ['main'],
      (tx) => ({
        text: tx.createValue(Pl.JsonObject, JSON.stringify(helloText)),
      }),
    );
    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString(),
    );

    expect(await mainResult.awaitStableValue()).eq(helloText);
  },
);

tplTest.concurrent(
  'should run bash from the template, echo a string to stdout and returns a stream log',
  async ({ driverKit, helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run.echo_to_stream',
      ['main'],
      (tx) => ({}),
    );

    const mainResult = result.computeOutput('main', (a) => {
      const entry = a?.persist();
      if (entry === undefined) return;
      return driverKit.logDriver.getLastLogs(entry, 10);
    });

    expect(await mainResult.awaitStableValue()).eq('Hello from bash\n');
  },
);

tplTest.concurrent(
  'should run bash from the template, cat a file from a directory and returns its content as a value resource',
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
      'exec.test.run.cat_on_file',
      ['main'],
      (tx) => ({
        file: tx.createValue(
          Pl.JsonObject,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          JSON.stringify((ourFile as any).handle),
        ),
      }),
    );

    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString(),
    );

    expect(await mainResult.awaitStableValue()).eq('42');
  },
);

tplTest.concurrent(
  'should run bash from the template, cat a file created by content and gets a content from stdout',
  async ({ driverKit, helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run.cat_on_value',
      ['main'],
      (tx) => ({}),
    );

    const mainResult = result.computeOutput('main', (a) =>
      a?.getDataAsString(),
    );

    expect(await mainResult.awaitStableValue()).eq(
      '>asd\nATGCTA\n>asdasd\nASD\n>asdasd\nD\n>asdasd\nAD\n',
    );
  },
);

tplTest.concurrent(
  'should save file set by regex',
  async ({ driverKit, helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run.save_file_set',
      ['p', 'x', 'all'],
      (tx) => ({}),
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
    // expect(all?.sort()).toContainAll(['p1', 'p2', 'p3', 'p4', 'x1', 'x2'].sort());
  },
);

tplTest.concurrent(
  'should run workdir processor',
  async ({ driverKit, helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run.with_wd_processor',
      ['p'],
      (tx) => ({}),
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
  },
);

tplTest.concurrent(
  'should run exec and eval all arguments as expressions',
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'exec.test.run.arg_with_var',
      ['out'],
      (_) => ({}),
    );

    const out = await result
      .computeOutput('out', (out) => out?.getDataAsString())
      .awaitStableValue();

    expect(out).toBe('4{2}');
  },
);
