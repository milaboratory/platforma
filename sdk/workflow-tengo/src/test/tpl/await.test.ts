import {
  Pl,
  ResourceId,
  ResourceRef,
  field,
  resourceType,
  toGlobalResourceId,
  toResourceId
} from '@milaboratory/pl-middle-layer';
import { tplTest } from '@milaboratory/sdk-test';

tplTest('test await simple state', async ({ pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    'test.tpl.await-state-1',
    ['main'],
    async (tx) => {
      inputResource = await toGlobalResourceId(
        tx.createStruct(resourceType('TestEph', '1'))
      );
      return {
        input1: inputResource
      };
    }
  );
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    tx.createField(field(inputResource, 'nestedField'), 'Input');
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    tx.lockInputs(inputResource);
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    tx.setField(
      field(inputResource, 'nestedField'),
      tx.createValue(Pl.JsonObject, '{}')
    );
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.awaitStableValue()).eq('A');
});

tplTest('test error field absent', async ({ pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    'test.tpl.await-state-1',
    ['main'],
    async (tx) => {
      inputResource = await toGlobalResourceId(
        tx.createStruct(resourceType('TestEph', '1'))
      );
      return {
        input1: inputResource
      };
    }
  );
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    tx.createField(field(inputResource, 'nestedField1'), 'Input');
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    tx.lockInputs(inputResource);
    await tx.commit();
  });
  await expect(
    async () => await mainResult.awaitStableFullValue()
  ).rejects.toThrow(/not found and inputs locked/);
});
