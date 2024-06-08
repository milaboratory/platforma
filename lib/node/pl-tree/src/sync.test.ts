import { field, TestHelpers } from '@milaboratory/pl-client-v2';
import { PlTreeState } from './state';
import { constructTreeLoadingRequest, loadTreeState } from './sync';
import { computable } from '@milaboratory/computable';
import { TestStructuralResourceType1 } from './test_utils';

test('load resources', async () => {
  await TestHelpers.withTempRoot(async cl => {
    const r1 = await cl.withWriteTx('CreatingStructure1', async tx => {
      const rr1 = tx.createStruct(TestStructuralResourceType1);
      const ff1 = field(tx.clientRoot, 'f1');
      tx.createField(ff1, 'Dynamic');
      tx.setField(ff1, rr1);
      await tx.commit();
      return await rr1.globalId;
    }, { sync: true });

    const treeState = new PlTreeState(r1);

    const theComputable = computable(treeState.entry(), {},
      a => a.node().traverse('a', 'b')?.getDataAsString());

    const refreshState = async (): Promise<void> => {
      const req = constructTreeLoadingRequest(treeState);
      const states = await cl.withReadTx('loadingTree',
        tx => loadTreeState(tx, req));
      treeState.updateFromResourceData(states);
    };

    await refreshState();

    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined
    });

    const r2 = await cl.withWriteTx('CreatingStructure2', async tx => {
      const rr2 = tx.createStruct(TestStructuralResourceType1);
      const ff2 = field(r1, 'a');
      tx.createField(ff2, 'Input');
      tx.setField(ff2, rr2);
      await tx.commit();
      return await rr2.globalId;
    }, { sync: true });

    await refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined
    });

    const r3 = await cl.withWriteTx('CreatingStructure3', async tx => {
      const rr3 = tx.createValue(TestStructuralResourceType1, 'hi!');
      const ff3 = field(r2, 'b');
      tx.createField(ff3, 'Input');
      tx.setField(ff3, rr3);
      await tx.commit();
      return await rr3.globalId;
    }, { sync: true });

    await refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: true,
      value: 'hi!'
    });

    await cl.withWriteTx('CreatingStructure3', async tx => {
      tx.lock(r1);
      tx.lock(r2);
      await tx.commit();
    }, { sync: true });

    await refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: true,
      value: 'hi!'
    });
  });
});
