import {
  Pl,
  ResourceId,
  field,
  resourceType,
  toGlobalResourceId
} from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';
import { Templates } from '../../..';
import { json } from 'stream/consumers';

tplTest('test await simple state', async ({ pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    Templates['tpl.test.await-state-1'],
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
    'tpl.test.await-state-1',
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

tplTest(
  'test await state with wildcards #1',
  async ({ pl, helper, expect }) => {
    let inputResource: ResourceId = 0n as ResourceId; // hack
    const result = await helper.renderTemplate(
      true,
      Templates['tpl.test.await-state-wildcard'],
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
  }
);

tplTest(
  'test await state with wildcards #2',
  async ({ pl, helper, expect }) => {
    let inputResource: ResourceId = 0n as ResourceId; // hack
    const result = await helper.renderTemplate(
      true,
      Templates['tpl.test.await-state-wildcard'],
      ['main'],
      async (tx) => {
        inputResource = await toGlobalResourceId(
          tx.createStruct(resourceType('Test', '1'))
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

    let nestedResource1: ResourceId = 0n as ResourceId; // hack

    await pl.withWriteTx('Test', async (tx) => {
      tx.setField(
        field(inputResource, 'nestedField'),
        tx.createValue(Pl.JsonObject, '{}')
      );
      nestedResource1 = await toGlobalResourceId(
        tx.createStruct(resourceType('Test', '1'))
      );
      tx.createField(field(inputResource, 'nestedField123'), 'Input');
      tx.setField(field(inputResource, 'nestedField123'), nestedResource1);
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
      tx.lockInputs(nestedResource1);
      await tx.commit();
    });
    await mainResult.refreshState();

    expect(await mainResult.awaitStableValue()).eq('AA');
  }
);

tplTest('test await state with match #1', async ({ pl, helper, expect }) => {
  let inputResource1: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    Templates['tpl.test.await-state-match'],
    ['main'],
    async (tx) => {
      inputResource1 = await toGlobalResourceId(
        tx.createStruct(resourceType('Test', '1'))
      );
      return {
        input1: inputResource1
      };
    }
  );
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    tx.createField(field(inputResource1, 'nestedFieldWithoutPrefix'), 'Input');
    tx.createField(field(inputResource1, 'the_prefix.nestedField'), 'Input');
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  let nestedResource1: ResourceId = 0n as ResourceId; // hack

  await pl.withWriteTx('Test', async (tx) => {
    tx.setField(
      field(inputResource1, 'the_prefix.nestedField'),
      tx.createValue(Pl.JsonObject, '{}')
    );
    nestedResource1 = await toGlobalResourceId(
      tx.createStruct(resourceType('Test', '1'))
    );
    tx.createField(
      field(inputResource1, 'nestedFieldWithoutPrefix'),
      'Input',
      nestedResource1
    );
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    tx.lockInputs(inputResource1);
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.awaitStableValue()).eq('1:1');
});

tplTest(
  'test await state with match, check behaviour with errors',
  async ({ pl, helper, expect }) => {
    let inputResource1: ResourceId = 0n as ResourceId; // hack
    const result = await helper.renderTemplate(
      true,
      Templates['tpl.test.await-state-match'],
      ['main'],
      async (tx) => {
        inputResource1 = await toGlobalResourceId(
          tx.createStruct(resourceType('Test', '1'))
        );
        return {
          input1: inputResource1
        };
      }
    );
    const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());
    await mainResult.refreshState();
    expect(await mainResult.getValue()).toBeUndefined();

    await pl.withWriteTx('Test', async (tx) => {
      tx.createField(
        field(inputResource1, 'nestedFieldWithoutPrefix'),
        'Input'
      );
      tx.createField(field(inputResource1, 'the_prefix.nestedField'), 'Input');
      await tx.commit();
    });
    await mainResult.refreshState();
    expect(await mainResult.getValue()).toBeUndefined();

    let nestedResource1: ResourceId = 0n as ResourceId; // hack

    await pl.withWriteTx('Test', async (tx) => {
      tx.setFieldError(
        field(inputResource1, 'the_prefix.nestedField'),
        tx.createValue(
          { name: 'json/resourceError', version: '1' },
          JSON.stringify({ message: 'the_test_error' })
        )
      );
      nestedResource1 = await toGlobalResourceId(
        tx.createStruct(resourceType('Test', '1'))
      );
      tx.createField(
        field(inputResource1, 'nestedFieldWithoutPrefix'),
        'Input',
        nestedResource1
      );
      await tx.commit();
    });
    await mainResult.refreshState();
    expect(await mainResult.getValue()).toBeUndefined();

    await pl.withWriteTx('Test', async (tx) => {
      tx.lockInputs(inputResource1);
      await tx.commit();
    });
    await mainResult.refreshState();
    expect(async () => await mainResult.awaitStableValue()).rejects.toThrow(
      /the_test_error/
    );
  }
);
