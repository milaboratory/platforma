import { Pl, type PlTransaction } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';

function createObject(tx: PlTransaction, value: any) {
  return tx.createValue(Pl.JsonObject, JSON.stringify(value));
}

tplTest(
  'should return export',
  // This timeout is set due to very slow performance of Platforma on large transactions, where thousands of fields and resources are created.
  // the test itself does almost nothing (concatenates 2 strings) and should pass immediately.
  // But because of tests execution nature in CI (when we several parallel test threads each creating large resource tree)
  // it may take long for test to complete.
  { timeout: 10000 },
  async ({ helper, expect }) => {
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
  }
);

tplTest(
  'should return undefined',
  // This timeout is set due to very slow performance of Platforma on large transactions, where thousands of fields and resources are created.
  // the test itself does almost nothing and should pass immediately.
  // But because of tests execution nature in CI (when we several parallel test threads each creating large resource tree)
  // it may take long for test to complete.
  { timeout: 10000 },
    async ({ helper, expect }) => {
    const wf2 = await helper.renderWorkflow('workflow.test.exports.wf3', false, {});

    const str = await awaitStableState(wf2.output('str', (a) => a?.getDataAsJson()));
    expect(str).toStrictEqual('<undefined>');
  }
);
