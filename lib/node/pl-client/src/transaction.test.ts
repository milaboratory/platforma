import { withTempRoot } from './test_config';
import { StructTestResource, ValueTestResource } from './resource_types';
import { toGlobalFieldId } from './transaction';
import { sleep } from './util/temporal';

test('get field', async () => {
  await withTempRoot(async pl => {
    const [rr0, theField1] = await pl.withWriteTx('resource1', async tx => {
      const r0 = tx.createStruct(StructTestResource);
      const r1 = tx.createStruct(StructTestResource);
      const f0 = { resourceId: tx.clientRoot, fieldName: 'test0' };
      const f1 = { resourceId: tx.clientRoot, fieldName: 'test1' };

      tx.createField(f0, 'Dynamic');
      tx.createField(f1, 'Dynamic');
      tx.setField(f0, r0);
      tx.setField(f1, r1);

      const theField1 = { resourceId: r1, fieldName: 'theField' };
      tx.createField(theField1, 'Input');
      tx.lock(r1);
      tx.setField(theField1, tx.getFutureFieldValue(r0, 'theField', 'Input'));

      await tx.commit();
      return [await r0.globalId, await toGlobalFieldId(theField1)];
    });

    const theField0 = { resourceId: rr0, fieldName: 'theField' };

    let fieldState = await pl.withReadTx('test', async tx => {
      return await tx.getField(theField1);
    });
    expect(fieldState.status === 'Empty' || fieldState.status === 'Assigned').toBe(true);

    await pl.withWriteTx('resource1', async tx => {
      tx.createField(theField0, 'Input');
      tx.lock(rr0);
      tx.setField(theField0, tx.createValue(ValueTestResource, Buffer.from('hello')));
      await tx.commit();
      return theField0;
    });

    while (true) {
      fieldState = await pl.withReadTx('test', async tx => {
        return await tx.getField(theField1);
      });
      if (fieldState.status === 'Resolved')
        break;
      await sleep(10);
    }
  });
});
