import { Pl } from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';

tplTest.concurrent(
  'test resolve in pure template', async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'resolve.pure-template',
      ['main'],
      (tx) => ({
        a: tx.createValue(Pl.JsonObject, JSON.stringify('A')),
        b: tx.createValue(Pl.JsonObject, JSON.stringify('B')),
      }),
    );
    const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());

    expect(await mainResult.awaitStableValue()).eq('ABcd');
  },
);

tplTest.concurrent(
  'test resolve in ephemeral template',
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      true,
      'resolve.eph-template',
      ['main'],
      (tx) => ({
        a: tx.createValue(Pl.JsonObject, JSON.stringify('A')),
        b: tx.createValue(Pl.JsonObject, JSON.stringify('B')),
      }),
    );
    const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());

    expect(await mainResult.awaitStableValue()).eq('ABcd');
  },
);

tplTest.concurrent(
  'test resolve in workflow',
  async ({ helper, expect }) => {
    const result = await helper.renderWorkflow('resolve.wf', false, {
      a: 'A',
      b: 'B',
    });

    const mainResult = result.output('main', (a) => a?.getDataAsJson());

    expect(await mainResult.awaitStableValue()).eq('ABcd');
  },
);

tplTest.concurrent('should return undefined on no result in resolve', async ({ helper, expect }) => {
  const result = await helper.renderWorkflow('resolve.wf_no_res', false, {
    errIfMissing: false,
  });

  const mainResult = result.output('rr', (a) => a?.getDataAsJson());

  console.dir(mainResult, { depth: 5 });

  expect(await mainResult.awaitStableValue()).eq('success');
});
