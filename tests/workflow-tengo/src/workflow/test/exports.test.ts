import { Pl, type PlTransaction } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';

function createObject(tx: PlTransaction, value: any) {
  return tx.createValue(Pl.JsonObject, JSON.stringify(value));
}

tplTest('should return export', async ({ helper, expect }) => {
  const wf1 = await helper.renderWorkflow('workflow.test.exports.wf1', false, {
    a: 'a',
    b: 'b'
  });

  const out1 = wf1.output('concat', (a) => a?.getDataAsJson());
  expect(await awaitStableState(out1)).eq('ab');

  const exp1 = await awaitStableState(wf1.export('e1.spec', (a) => a?.getDataAsJson()));

  const ctx = await awaitStableState(wf1.context());

  const wf2 = await helper.renderWorkflow('workflow.test.exports.wf2', false, {}, { parent: ctx });

  const query = await awaitStableState(wf2.output('query', (a) => a?.getDataAsJson()));
  console.dir(query, { depth: 5 });

  const join = await awaitStableState(wf2.output('join', (a) => a?.getDataAsJson()));
  expect(join).eq('ab');
});
