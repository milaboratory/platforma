/* eslint-disable @typescript-eslint/no-unused-vars */
import { awaitStableState, tplTest } from '@platforma-sdk/test';

tplTest(
  'resolve: should return resolved export',
  // This timeout is set due to very slow performance of Platforma on large transactions, where thousands of fields and resources are created.
  // the test itself does almost nothing (concatenates 2 strings) and should pass immediately.
  // But because of tests execution nature in CI (when we several parallel test threads each creating large resource tree)
  // it may take long for test to complete.
  async ({ helper, expect }) => {
    const wf1 = await helper.renderWorkflow('workflow.test.exports.wf1', false, {
      a: 'a',
      b: 'b',
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
  },
);

tplTest(
  'resolve: should return resolved anchors and anchored columns',
  // This timeout is set due to very slow performance of Platforma on large transactions, where thousands of fields and resources are created.
  // the test itself does almost nothing (concatenates 2 strings) and should pass immediately.
  // But because of tests execution nature in CI (when we several parallel test threads each creating large resource tree)
  // it may take long for test to complete.
  async ({ helper, expect }) => {
    const wf1 = await helper.renderWorkflow('workflow.test.exports.wf1', false, {
      a: 'a',
      b: 'b',
    }, { blockId: 'b1' });

    const ctx = await awaitStableState(wf1.context());

    const wf4 = await helper.renderWorkflow('workflow.test.exports.wf4', false, {}, { parent: ctx, blockId: 'b2' });

    const anchorSpec = await awaitStableState(wf4.output('anchorSpec', (a) => a?.getDataAsJson()));
    expect(anchorSpec).toMatchObject({
      kind: 'PColumn',
      name: 'pl7.app/test1',
    });

    const r1 = await awaitStableState(wf4.output('r1', (a) => a?.getDataAsJson()));
    expect(r1).toMatchObject({
      kind: 'PColumn',
      name: 'pl7.app/test2',
    });
  },
);

tplTest(
  'should return undefined',
  // This timeout is set due to very slow performance of Platforma on large transactions, where thousands of fields and resources are created.
  // the test itself does almost nothing and should pass immediately.
  // But because of tests execution nature in CI (when we several parallel test threads each creating large resource tree)
  // it may take long for test to complete.
  async ({ helper, expect }) => {
    const wf2 = await helper.renderWorkflow('workflow.test.exports.wf3', false, {});

    const str = await awaitStableState(wf2.output('str', (a) => a?.getDataAsJson()));
    expect(str).toStrictEqual('<undefined>');
  },
);
