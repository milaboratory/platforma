import { Pl, type PlTransaction } from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';

function createObject(tx: PlTransaction, value: any) {
  return tx.createValue(Pl.JsonObject, JSON.stringify(value));
}

tplTest('should return results when run body of the workflow', async ({ helper, expect }) => {
  const prod = await helper.renderWorkflow('workflow.test.wf1', false, {
    testValue: 'Truman Prod'
  });

  expect(await prod.output('outputResult', (a) => a?.getDataAsJson()).awaitStableValue()).eq(
    'Truman Prod Show Run'
  );
});

tplTest('should return results when pre run of the workflow', async ({ helper, expect }) => {
  const prerun = await helper.renderWorkflow('workflow.test.wf1', true, {
    testValue: 'Truman PreRun'
  });

  expect(await prerun.output('outputResult', (a) => a?.getDataAsJson()).awaitStableValue()).eq(
    'Truman PreRun Show Run'
  );
});

tplTest(
  'should return dummy result and ctx for staging if pre-run template not specified',
  async ({ helper, expect }) => {
    const prerun = await helper.renderWorkflow('workflow.test.wf2', true, {
      testValue: 'Truman PreRun'
    });

    expect(
      await prerun.renderResult
        .computeOutput('context', (c, ctx) => {
          const ready = c?.getIsReadyOrError();
          if (!ready) ctx.markUnstable('not_ready');
          return ready;
        })
        .awaitStableValue()
    ).eq(true);

    expect(
      await prerun.renderResult
        .computeOutput('result', (c, ctx) => {
          const ready = c?.getIsReadyOrError();
          if (!ready) ctx.markUnstable('not_ready');
          return ready;
        })
        .awaitStableValue()
    ).eq(true);
  }
);
