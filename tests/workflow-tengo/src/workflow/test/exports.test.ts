import { Pl, type PlTransaction } from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';

function createObject(tx: PlTransaction, value: any) {
  return tx.createValue(Pl.JsonObject, JSON.stringify(value));
}

tplTest('should return export', async ({ helper, expect }) => {
  const wf1 = await helper.renderWorkflow('workflow.test.exports.wf1', false, {
    a: 'a',
    b: 'b'
  });

  const out1 = wf1.output('concat', (a) => a?.getDataAsJson());
  expect(await out1.awaitStableValue()).eq('ab');

  const exp1 = await wf1
    .export('e1.spec', (a) => a?.getDataAsJson())
    .awaitStableValue();

  const ctx = await wf1.context().awaitStableValue();

  const wf2 = await helper.renderWorkflow(
    'workflow.test.exports.wf2',
    false,
    {},
    {parent: ctx}
  );

  const query = await wf2
    .output('query', (a) => a?.getDataAsJson())
    .awaitStableValue();
  console.dir(query, { depth: 5 });

  const join = await wf2
    .output('join', (a) => a?.getDataAsJson())
    .awaitStableValue();
  expect(join).eq('ab');
});
