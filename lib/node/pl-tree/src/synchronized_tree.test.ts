import { field, TestHelpers } from '@milaboratories/pl-client';
import { TestStructuralResourceType1 } from './test_utils';
import { Computable } from '@milaboratories/computable';
import { SynchronizedTreeState } from './synchronized_tree';

test('simple synchronized tree test', async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const r1 = await pl.withWriteTx(
      'CreatingStructure1',
      async (tx) => {
        const rr1 = tx.createStruct(TestStructuralResourceType1);
        const ff1 = field(tx.clientRoot, 'f1');
        tx.createField(ff1, 'Dynamic');
        tx.setField(ff1, rr1);
        await tx.commit();
        return await rr1.globalId;
      },
      { sync: true }
    );

    const treeState = await SynchronizedTreeState.init(pl, r1, {
      stopPollingDelay: 10,
      pollingInterval: 10
    });

    const theComputable = Computable.make((c) =>
      c.accessor(treeState.entry()).node().traverse('a', 'b')?.getDataAsString()
    );

    await theComputable.refreshState();

    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined
    });

    const r2 = await pl.withWriteTx(
      'CreatingStructure2',
      async (tx) => {
        const rr2 = tx.createStruct(TestStructuralResourceType1);
        const ff2 = field(r1, 'a');
        tx.createField(ff2, 'Input');
        tx.setField(ff2, rr2);
        await tx.commit();
        return await rr2.globalId;
      },
      { sync: true }
    );

    await theComputable.refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined
    });

    const r3 = await pl.withWriteTx(
      'CreatingStructure3',
      async (tx) => {
        const rr3 = tx.createValue(TestStructuralResourceType1, 'hi!');
        const ff3 = field(r2, 'b');
        tx.createField(ff3, 'Input');
        tx.setField(ff3, rr3);
        await tx.commit();
        return await rr3.globalId;
      },
      { sync: true }
    );

    await theComputable.refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: true,
      value: 'hi!'
    });

    await pl.withWriteTx(
      'CreatingStructure3',
      async (tx) => {
        tx.lock(r1);
        tx.lock(r2);
        await tx.commit();
      },
      { sync: true }
    );

    await theComputable.refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: true,
      value: 'hi!'
    });

    await treeState.awaitSyncLoopTermination();
  });
});

test('synchronized tree test with KV', async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const r1 = await pl.withWriteTx(
      'CreatingStructure1',
      async (tx) => {
        const rr1 = tx.createStruct(TestStructuralResourceType1);
        const ff1 = field(tx.clientRoot, 'f1');
        tx.createField(ff1, 'Dynamic');
        tx.setField(ff1, rr1);
        await tx.commit();
        return await rr1.globalId;
      },
      { sync: true }
    );

    const treeState = await SynchronizedTreeState.init(pl, r1, {
      stopPollingDelay: 10,
      pollingInterval: 10
    });

    const theComputable = Computable.make((c) =>
      c.accessor(treeState.entry()).node().traverse('a')?.getKeyValueAsString('b', true)
    );

    await theComputable.refreshState();

    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined
    });

    const r2 = await pl.withWriteTx(
      'CreatingStructure2',
      async (tx) => {
        const rr2 = tx.createStruct(TestStructuralResourceType1);
        const ff2 = field(r1, 'a');
        tx.createField(ff2, 'Input');
        tx.setField(ff2, rr2);
        await tx.commit();
        return await rr2.globalId;
      },
      { sync: true }
    );

    await theComputable.refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined
    });

    await pl.withWriteTx('AssignKeyValue', async (tx) => {
      tx.setKValue(r2, 'b', 'hi!');
      await tx.commit();
    });

    await theComputable.refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: true,
      value: 'hi!'
    });

    await treeState.awaitSyncLoopTermination();
  });
});

test('termination test', async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const r1 = await pl.withWriteTx(
      'CreatingStructure1',
      async (tx) => {
        const rr1 = tx.createStruct(TestStructuralResourceType1);
        const ff1 = field(tx.clientRoot, 'f1');
        tx.createField(ff1, 'Dynamic');
        tx.setField(ff1, rr1);
        await tx.commit();
        return await rr1.globalId;
      },
      { sync: true }
    );

    const treeState = await SynchronizedTreeState.init(pl, r1, {
      stopPollingDelay: 10,
      pollingInterval: 10
    });

    const entry = treeState.entry();
    const theComputable = Computable.make((c) =>
      c.accessor(entry).node().traverse('a')?.getKeyValueAsString('b', true)
    );

    await theComputable.refreshState();

    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined
    });

    await treeState.terminate();

    const resultAfterTermination = await theComputable.getValueOrError();
    expect(resultAfterTermination).toMatchObject({
      type: 'error'
    });
    expect((resultAfterTermination as any).errors[0].message).toMatch('terminated');
  });
});
