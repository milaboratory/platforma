import type {
  ResourceId } from '@milaboratories/pl-middle-layer';
import {
  Pl,
  field,
  resourceType,
  toGlobalResourceId,
} from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';
import { Templates } from '../../..';
import crypto from 'crypto';

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral' },
  { isEph: false, name: 'pure' },
])('test await simple state ($name)', async ({ isEph }, { pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    Templates['tpl.test.await-state-1'],
    ['main'],
    async (tx) => {
      inputResource = await toGlobalResourceId(
        isEph ? tx.createEphemeral(resourceType('TestEph', '1')) : tx.createStruct(resourceType('TestEph', '1')),
      );
      return {
        input1: inputResource,
      };
    },
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
      tx.createValue(Pl.JsonObject, '{}'),
    );
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.awaitStableValue()).eq('A');
});

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral' },
  { isEph: false, name: 'pure' },
])('await simple state with duplicate ($name)', async ({ isEph }, { pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  let r1: ResourceId = 0n as ResourceId; // hack; original
  let r2: ResourceId = 0n as ResourceId; // hack; duplicate
  const uuid = crypto.randomUUID();

  const result = await helper.renderTemplate(
    true,
    Templates['tpl.test.await-state-1'],
    ['main'],
    async (tx) => {
      inputResource = await toGlobalResourceId(
        isEph ? tx.createEphemeral(resourceType('TestRes', '1')) : tx.createStruct(resourceType('TestRes', '1')),
      );
      r1 = await toGlobalResourceId(
        isEph ? tx.createEphemeral(resourceType('TestRes', '1')) : tx.createStruct(resourceType('TestRes', '1')),
      );
      const r1f1 = field(r1, 'f1');
      tx.createField(r1f1, 'Input');
      tx.setField(r1f1, tx.createValue(Pl.JsonObject, JSON.stringify({ uuid })));
      tx.lockInputs(r1);
      return {
        input1: inputResource,
        r1: r1,
      };
    },
  );
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    const nestedField = field(inputResource, 'nestedField');
    tx.createField(nestedField, 'Input');
    r2 = await toGlobalResourceId(
      isEph ? tx.createEphemeral(resourceType('TestRes', '1')) : tx.createStruct(resourceType('TestRes', '1')),
    );
    tx.createField(field(r2, 'f1'), 'Input');
    tx.lockInputs(inputResource);
    tx.lockInputs(r2);
    tx.setField(nestedField, r2);

    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    tx.setField(field(r2, 'f1'), tx.createValue(Pl.JsonObject, JSON.stringify({ uuid })));
    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.awaitStableValue()).eq('A');
});

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral' },
  { isEph: false, name: 'pure' },
])('await simple state with field error ($name)', async ({ isEph }, { pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  let r1: ResourceId = 0n as ResourceId; // hack

  const result = await helper.renderTemplate(
    true,
    Templates['tpl.test.await-state-1'],
    ['main'],
    async (tx) => {
      inputResource = await toGlobalResourceId(
        isEph ? tx.createEphemeral(resourceType('TestRes', '1')) : tx.createStruct(resourceType('TestRes', '1')),
      );
      const nestedField = field(inputResource, 'nestedField');
      tx.createField(nestedField, 'Input');
      r1 = await toGlobalResourceId(
        isEph ? tx.createEphemeral(resourceType('TestRes', '1')) : tx.createStruct(resourceType('TestRes', '1')),
      );
      const r1f1 = field(r1, 'f1');
      tx.createField(r1f1, 'Input');
      tx.lockInputs(r1);
      // setting nestedField to reference f1 of r1
      tx.setField(nestedField, r1f1);
      return {
        input1: inputResource,
      };
    },
  );
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    const r1f1 = field(r1, 'f1');
    tx.setFieldError(r1f1, tx.createError('the_test_error'));
    await tx.commit();
  });
  await mainResult.refreshState();
  await expect(async () => await mainResult.awaitStableValue()).rejects.toThrow(/the_test_error/);
});

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral' },
  { isEph: false, name: 'pure' },
])('await simple state with resource error ($name)', async ({ isEph }, { pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  let r1: ResourceId = 0n as ResourceId; // hack
  let r2: ResourceId = 0n as ResourceId; // hack
  const uuid = crypto.randomUUID();

  const result = await helper.renderTemplate(
    true,
    Templates['tpl.test.await-state-1'],
    ['main'],
    async (tx) => {
      inputResource = await toGlobalResourceId(
        isEph ? tx.createEphemeral(resourceType('TestRes', '1')) : tx.createStruct(resourceType('TestRes', '1')),
      );
      // r1 resource will keep input template from ready state, and prevent automatic error propagation mechanism from engaging
      r1 = await toGlobalResourceId(
        isEph ? tx.createEphemeral(resourceType('TestRes', '1')) : tx.createStruct(resourceType('TestRes', '1'), uuid),
      );
      tx.createField(field(r1, 'f1'), 'Input');
      tx.lockInputs(r1);
      return {
        input1: inputResource,
        r1,
      };
    },
  );
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    const nestedField = field(inputResource, 'nestedField');
    tx.createField(nestedField, 'Input');
    r2 = await toGlobalResourceId(
      isEph ? tx.createEphemeral(resourceType('TestRes', '1')) : tx.createStruct(resourceType('TestRes', '1')),
    );
    tx.createField(field(r2, 'f1'), 'Input');
    tx.lockInputs(inputResource);
    tx.lockInputs(r2);
    tx.setField(nestedField, r2);

    await tx.commit();
  });
  await mainResult.refreshState();
  expect(await mainResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    tx.setResourceError(r2, tx.createError('the_test_error'));
    await tx.commit();
  });
  await mainResult.refreshState();
  await expect(async () => await mainResult.awaitStableValue()).rejects.toThrow(/the_test_error/);
});

tplTest('test error field absent', async ({ pl, helper, expect }) => {
  let inputResource: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    'tpl.test.await-state-1',
    ['main'],
    async (tx) => {
      inputResource = await toGlobalResourceId(
        tx.createStruct(resourceType('TestEph', '1')),
      );
      return {
        input1: inputResource,
      };
    },
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
    async () => await mainResult.awaitStableFullValue(),
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
          tx.createStruct(resourceType('TestEph', '1')),
        );
        return {
          input1: inputResource,
        };
      },
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
        tx.createValue(Pl.JsonObject, '{}'),
      );
      await tx.commit();
    });
    await mainResult.refreshState();
    expect(await mainResult.awaitStableValue()).eq('A');
  },
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
          tx.createStruct(resourceType('Test', '1')),
        );
        return {
          input1: inputResource,
        };
      },
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
        tx.createValue(Pl.JsonObject, '{}'),
      );
      nestedResource1 = await toGlobalResourceId(
        tx.createStruct(resourceType('Test', '1')),
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
  },
);

tplTest('test await state with match #1', async ({ pl, helper, expect }) => {
  let inputResource1: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    Templates['tpl.test.await-state-match'],
    ['main'],
    async (tx) => {
      inputResource1 = await toGlobalResourceId(
        tx.createStruct(resourceType('Test', '1')),
      );
      return {
        input1: inputResource1,
      };
    },
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
      tx.createValue(Pl.JsonObject, '{}'),
    );
    nestedResource1 = await toGlobalResourceId(
      tx.createStruct(resourceType('Test', '1')),
    );
    tx.createField(
      field(inputResource1, 'nestedFieldWithoutPrefix'),
      'Input',
      nestedResource1,
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
          tx.createStruct(resourceType('Test', '1')),
        );
        return {
          input1: inputResource1,
        };
      },
    );
    const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());
    await mainResult.refreshState();
    expect(await mainResult.getValue()).toBeUndefined();

    await pl.withWriteTx('Test', async (tx) => {
      tx.createField(
        field(inputResource1, 'nestedFieldWithoutPrefix'),
        'Input',
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
          JSON.stringify({ message: 'the_test_error' }),
        ),
      );
      nestedResource1 = await toGlobalResourceId(
        tx.createStruct(resourceType('Test', '1')),
      );
      tx.createField(
        field(inputResource1, 'nestedFieldWithoutPrefix'),
        'Input',
        nestedResource1,
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
      /the_test_error/,
    );
  },
);
