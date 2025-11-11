import { withTempRoot } from '../test/test_config';
import { StructTestResource } from '../helpers/pl';
import { toGlobalFieldId } from './transaction';
import { test, expect } from 'vitest';
import { sleep } from '@milaboratories/ts-helpers';
import { DisconnectedError } from './errors';

test('connectivity: disconnect', async () => {
  await withTempRoot(async (pl, proxy) => {
    await expect(async () => {
      await pl.withWriteTx('resource1', async (tx) => {
        const r0 = tx.createStruct(StructTestResource);
        const r1 = tx.createStruct(StructTestResource);
        const f0 = { resourceId: tx.clientRoot, fieldName: 'test0' };
        const f1 = { resourceId: tx.clientRoot, fieldName: 'test1' };
  
        tx.createField(f0, 'Dynamic');
        tx.createField(f1, 'Dynamic');
        tx.setField(f0, r0);
        tx.setField(f1, r1);
  
        await proxy?.disconnectAll();

        await sleep(100);
  
        const theField1 = { resourceId: r1, fieldName: 'theField' };
        tx.createField(theField1, 'Input');
        tx.lock(r1);
        tx.setField(theField1, tx.getFutureFieldValue(r0, 'theField', 'Input'));
  
        await tx.commit().catch((err) => console.log('error committing tx', err));
  
        return [await r0.globalId, await toGlobalFieldId(theField1)];
      });
    }).rejects.toThrow(DisconnectedError);
  }, { viaTcpProxy: true });
});

test.skip('connectivity: latency', async () => {
  await withTempRoot(async (pl, proxy) => {
    proxy?.setLatency(10_000);
    await expect(async () => {
      const result = await pl.withWriteTx('resource1', async (tx) => {
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
  
        await tx.commit().catch((err) => console.log('error committing tx', err));
  
        return [await r0.globalId, await toGlobalFieldId(theField1)];
      });

      console.log('result', result);

      return result;
    }).rejects.toThrow(Error);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, { viaTcpProxy: true });
}, 60_000);
