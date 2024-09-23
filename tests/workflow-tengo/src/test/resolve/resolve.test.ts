import { Pl } from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';

tplTest(
  'test resolve in pure template',
  /*{timeout: 10000},*/ async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'test.resolve.pure-template',
      ['main'],
      (tx) => ({
        a: tx.createValue(Pl.JsonObject, JSON.stringify('A')),
        b: tx.createValue(Pl.JsonObject, JSON.stringify('B'))
      })
    );
    const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());

    expect(await mainResult.awaitStableValue()).eq('ABcd');
  }
);

tplTest(
  'test resolve in ephemeral template',
  /*{timeout: 10000},*/ async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      true,
      'test.resolve.eph-template',
      ['main'],
      (tx) => ({
        a: tx.createValue(Pl.JsonObject, JSON.stringify('A')),
        b: tx.createValue(Pl.JsonObject, JSON.stringify('B'))
      })
    );
    const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());

    expect(await mainResult.awaitStableValue()).eq('ABcd');
  }
);

tplTest(
  'test resolve in workflow',
  /*{timeout: 10000},*/ async ({ helper, expect }) => {
    const result = await helper.renderWorkflow('test.resolve.wf', false, {
      a: 'A',
      b: 'B'
    });

    const mainResult = result.output('main', (a) => a?.getDataAsJson());

    expect(await mainResult.awaitStableValue()).eq('ABcd');
  }
);


tplTest('should return undefined on no result in resolve', async ({ helper, expect }) => {
  const result = await helper.renderWorkflow('test.resolve.wf_no_res', false, {
    errIfMissing: false
  });

  const mainResult = result.output('rr', (a) => a?.getDataAsJson());

  console.dir(mainResult, {depth: 5})

  expect(await mainResult.awaitStableValue()).eq('success');
});
