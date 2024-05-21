import { withTempRoot } from './test_config';
import { StructTestResource, ValueTestResource } from './resource_types';
import { toGlobalFieldId } from './transaction';
import { sleep } from './util/temporal';
import { RecoverablePlError } from './errors';

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

test('handle absent resource error', async () => {
  await withTempRoot(async pl => {
    const [rr0, ff0] = await pl.withWriteTx('testCreateResource', async tx => {
      const r0 = tx.createStruct(StructTestResource);
      const f0 = { resourceId: tx.clientRoot, fieldName: 'test0' };

      tx.createField(f0, 'Dynamic');
      tx.setField(f0, r0);

      await tx.commit();
      return [await r0.globalId, await toGlobalFieldId(f0)];
    });

    await pl.withWriteTx('testDeleteResource', async tx => {
      await tx.getResourceData(rr0, true);
      tx.removeField(ff0);
      await tx.commit();
    }, { sync: true });

    let rState = await pl.withReadTx('testRetrieveResource', async tx => {
      await expect(async () => {
        await tx.getResourceData(rr0, true);
      })
        .rejects
        .toThrow(RecoverablePlError);
      return await tx.getResourceData(tx.clientRoot, true);
    });

    expect(rState.fields).toHaveLength(0);

    rState = await pl.withReadTx('testRetrieveResource', async tx => {
      await expect(async () => {
        await tx.getField(ff0);
      })
        .rejects
        .toThrow(RecoverablePlError);
      return await tx.getResourceData(tx.clientRoot, true);
    });

    expect(rState.fields).toHaveLength(0);
  });
});

test('handle KV storage', async () => {
  await withTempRoot(async pl => {
    await pl.withWriteTx('writeKV', async tx => {
      tx.setKValue(tx.clientRoot, 'a', 'a');
      tx.setKValue(tx.clientRoot, 'b', 'b');
      await tx.commit();
    });

    await pl.withReadTx('testReadIndividual', async tx => {
      expect(await tx.getKValueString(tx.clientRoot, 'a')).toEqual('a');
      expect(await tx.getKValueString(tx.clientRoot, 'b')).toEqual('b');
    });

    await pl.withReadTx('testReadIndividualAndList', async tx => {
      expect(await tx.getKValueString(tx.clientRoot, 'a')).toEqual('a');
      expect(await tx.getKValueString(tx.clientRoot, 'b')).toEqual('b');
      expect(await tx.listKeyValuesString(tx.clientRoot)).toEqual([
        { key: 'a', value: 'a' },
        { key: 'b', value: 'b' }
      ]);
      expect(await tx.getKValueString(tx.clientRoot, 'a')).toEqual('a');
      expect(await tx.getKValueString(tx.clientRoot, 'b')).toEqual('b');
    });
  });
});
