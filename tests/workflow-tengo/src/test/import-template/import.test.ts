import { Pl } from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';

tplTest(
  'test import template in pure template',
  /*{timeout: 10000},*/ async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'test.import-template.pure-template',
      ['main'],
      (tx) => ({
        a: tx.createValue(Pl.JsonObject, JSON.stringify('A')),
        b: tx.createValue(Pl.JsonObject, JSON.stringify('B'))
      })
    );
    const mainResult = result.computeOutput('main', (a, ctx) => {
      const result = a?.getDataAsJson();
      if (result === undefined) {
        ctx.markUnstable();
      }

      return result;
    });

    expect(await mainResult.awaitStableValue()).eq('AB');
  }
);

tplTest(
  'test import template in workflow',
  /*{timeout: 10000},*/ async ({ helper, expect }) => {
    const wf = await helper.renderWorkflow(
      'test.import-template.workflow',
      false,
      { a: 'c', b: 'd' }
    );

    const output = wf.output('main', (a, ctx) => {
      const result = a?.getDataAsJson();
      if (result === undefined) ctx.markUnstable();
      return result;
    });

    expect(await output.awaitStableValue()).eq('cd');
  }
);
