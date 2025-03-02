import type { FieldId, ResourceId } from '@milaboratories/pl-middle-layer';
import { Pl, field, resourceType, toGlobalFieldId, toGlobalResourceId } from '@milaboratories/pl-middle-layer';
import { sleep } from '@milaboratories/ts-helpers';
import { tplTest } from '@platforma-sdk/test';

tplTest.for([
  { isEph: true, name: 'ephemeral field' },
  { isEph: false, name: 'non-ephemeral field' },
])(
  'should resolve future field with default value: field exists ($name)',
  { timeout: 10000 },
  async ({ isEph }, { helper, expect }) => {
    // Create a sample resource with fields
    const result = await helper.renderTemplate(
      true,
      'll.test-get-field',
      ['result'],
      (tx) => {
        const resourceWithField = tx.createStruct(resourceType('std/map', '1'));
        tx.createField(field(resourceWithField, 'x'), 'Input');
        tx.setField(
          field(resourceWithField, 'x'),
          tx.createValue(Pl.JsonObject, JSON.stringify('value-exists')),
        );
        tx.lock(resourceWithField);
        return {
          resource: resourceWithField,
          fieldInfo: tx.createValue(Pl.JsonObject, JSON.stringify({
            name: 'x',
            type: 'input',
            isEph: isEph,
          })),
          defaultValue: tx.createValue(Pl.JsonObject, JSON.stringify('default-value')),
        };
      },
    );

    // Check that we get the actual field value when it exists
    const fieldResult = result.computeOutput('result', (a) => a?.getDataAsJson());
    expect(await fieldResult.awaitStableValue()).toBe('value-exists');
  },
);

tplTest.for([
  { isEph: true, name: 'ephemeral field' },
  { isEph: false, name: 'non-ephemeral field' },
])(
  'should resolve future field with default value: field does not exist ($name)',
  { timeout: 10000 },
  async ({ isEph }, { helper, expect }) => {
    // Create a sample resource without the target field
    const result = await helper.renderTemplate(
      true,
      'll.test-get-field',
      ['result'],
      (tx) => {
        const resourceWithoutField = tx.createStruct(resourceType('std/map', '1'));
        tx.createField(field(resourceWithoutField, 'otherField'), 'Input');
        tx.setField(
          field(resourceWithoutField, 'otherField'),
          tx.createValue(Pl.JsonObject, JSON.stringify('other-value')),
        );
        tx.lock(resourceWithoutField);
        return {
          resource: resourceWithoutField,
          fieldInfo: tx.createValue(Pl.JsonObject, JSON.stringify({
            name: 'nonExistentField',
            type: 'input',
            isEph: isEph,
          })),
          defaultValue: tx.createValue(Pl.JsonObject, JSON.stringify('default-value')),
        };
      },
    );

    // Check that we get the default value when field doesn't exist
    const fieldResult = result.computeOutput('result', (a) => a?.getDataAsJson());
    expect(await fieldResult.awaitStableValue()).toBe('default-value');
  },
);

tplTest.for([
  { isEph: true, name: 'ephemeral field' },
  { isEph: false, name: 'non-ephemeral field' },
])(
  'should resolve future field with default value: field does not exist & default appears later ($name)',
  { timeout: 10000 },
  async ({ isEph }, { helper, pl, expect }) => {
    // Create a sample resource without the target field
    let defaultValueField: FieldId | undefined = undefined;
    const result = await helper.renderTemplate(
      true,
      'll.test-get-field',
      ['result'],
      async (tx) => {
        const resourceWithoutField = tx.createStruct(resourceType('std/map', '1'));
        tx.createField(field(resourceWithoutField, 'otherField'), 'Input');
        tx.setField(
          field(resourceWithoutField, 'otherField'),
          tx.createValue(Pl.JsonObject, JSON.stringify('other-value')),
        );
        tx.lock(resourceWithoutField);

        const defaultHolder = tx.createStruct(resourceType('std/map', '1'));
        const defaultValueFieldLocal = field(defaultHolder, 'defaultValue');
        tx.createField(defaultValueFieldLocal, 'Input');
        tx.lock(defaultHolder);

        defaultValueField = await toGlobalFieldId(defaultValueFieldLocal);

        return {
          resource: resourceWithoutField,
          fieldInfo: tx.createValue(Pl.JsonObject, JSON.stringify({
            name: 'nonExistentField',
            type: 'input',
            isEph: isEph,
          })),
          defaultValue: defaultValueField,
        };
      },
    );

    await sleep(3);

    await pl.withWriteTx('setDefault', async (tx) => {
      tx.setField(defaultValueField!, tx.createValue(Pl.JsonObject, JSON.stringify('default-value')));
      await tx.commit();
    });

    // Check that we get the default value when field doesn't exist
    const fieldResult = result.computeOutput('result', (a) => a?.getDataAsJson());
    expect(await fieldResult.awaitStableValue()).toBe('default-value');
  },
);

tplTest.for([
  { isEph: true, name: 'ephemeral field' },
  { isEph: false, name: 'non-ephemeral field' },
])(
  'should resolve future field with default value: when target resource appears later ($name)',
  { timeout: 10000 },
  async ({ isEph }, { helper, pl, expect }) => {
    // Create a holder for the resource that will appear later
    let resourceHolderField: FieldId | undefined = undefined;
    const result = await helper.renderTemplate(
      true,
      'll.test-get-field',
      ['result'],
      async (tx) => {
        // Create a placeholder resource to hold our actual resource
        const resourceHolder = tx.createStruct(resourceType('std/map', '1'));
        const resourceHolderFieldLocal = field(resourceHolder, 'resourceValue');
        tx.createField(resourceHolderFieldLocal, 'Input');
        tx.lock(resourceHolder);

        resourceHolderField = await toGlobalFieldId(resourceHolderFieldLocal);

        return {
          resource: resourceHolderFieldLocal,
          fieldInfo: tx.createValue(Pl.JsonObject, JSON.stringify({
            name: 'x',
            type: 'input',
            isEph: isEph,
          })),
          defaultValue: tx.createValue(Pl.JsonObject, JSON.stringify('default-value')),
        };
      },
    );

    await sleep(3);

    // Now create and set the actual resource with the field
    await pl.withWriteTx('setResource', async (tx) => {
      const actualResource = tx.createStruct(resourceType('std/map', '1'));
      tx.createField(field(actualResource, 'x'), 'Input');
      tx.setField(
        field(actualResource, 'x'),
        tx.createValue(Pl.JsonObject, JSON.stringify('delayed-resource-value')),
      );
      tx.lock(actualResource);

      tx.setField(resourceHolderField!, actualResource);
      await tx.commit();
    });

    // Check that we get the field value from the resource that appeared later
    const fieldResult = result.computeOutput('result', (a) => a?.getDataAsJson());
    expect(await fieldResult.awaitStableValue()).toBe('delayed-resource-value');
  },
);

tplTest.for([
  { isEph: true, name: 'ephemeral field' },
  { isEph: false, name: 'non-ephemeral field' },
])(
  'should resolve future field with default value: when target resource appears later with delayed locking and field creation ($name)',
  { timeout: 10000 },
  async ({ isEph }, { helper, pl, expect }) => {
    // Create a holder for the resource that will appear later
    let resourceHolderField: FieldId | undefined = undefined;
    const result = await helper.renderTemplate(
      true,
      'll.test-get-field',
      ['result'],
      async (tx) => {
        // Create a placeholder resource to hold our actual resource
        const resourceHolder = tx.createStruct(resourceType('std/map', '1'));
        const resourceHolderFieldLocal = field(resourceHolder, 'resourceValue');
        tx.createField(resourceHolderFieldLocal, 'Input');
        tx.lock(resourceHolder);

        resourceHolderField = await toGlobalFieldId(resourceHolderFieldLocal);

        return {
          resource: resourceHolderFieldLocal,
          fieldInfo: tx.createValue(Pl.JsonObject, JSON.stringify({
            name: 'x',
            type: 'input',
            isEph: isEph,
          })),
          defaultValue: tx.createValue(Pl.JsonObject, JSON.stringify('default-value')),
        };
      },
    );

    await sleep(3);

    let actualResource: ResourceId | undefined = undefined;

    // Now create and set the actual resource with the field
    await pl.withWriteTx('setResource', async (tx) => {
      const actualResourceLocal = tx.createStruct(resourceType('std/map', '1'));
      actualResource = await toGlobalResourceId(actualResourceLocal);
      tx.setField(resourceHolderField!, actualResourceLocal);
      await tx.commit();
    });

    await sleep(3);

    // Now create and set the actual resource with the field
    await pl.withWriteTx('setField', async (tx) => {
      tx.createField(field(actualResource!, 'x'), 'Input');
      tx.setField(
        field(actualResource!, 'x'),
        tx.createValue(Pl.JsonObject, JSON.stringify('delayed-resource-value')),
      );
      await tx.commit();
    });

    await sleep(3);

    // Now create and set the actual resource with the field
    await pl.withWriteTx('setField', async (tx) => {
      tx.lock(actualResource!);
      await tx.commit();
    });

    // Check that we get the field value from the resource that appeared later
    const fieldResult = result.computeOutput('result', (a) => a?.getDataAsJson());
    expect(await fieldResult.awaitStableValue()).toBe('delayed-resource-value');
  },
);

tplTest.for([
  { isEph: true, name: 'ephemeral field' },
  { isEph: false, name: 'non-ephemeral field' },
])(
  'should resolve future field with default value: field does not exist & target resource appears later with delayed locking and field creation ($name)',
  { timeout: 10000 },
  async ({ isEph }, { helper, pl, expect }) => {
    // Create a holder for the resource that will appear later
    let resourceHolderField: FieldId | undefined = undefined;
    const result = await helper.renderTemplate(
      true,
      'll.test-get-field',
      ['result'],
      async (tx) => {
        // Create a placeholder resource to hold our actual resource
        const resourceHolder = tx.createStruct(resourceType('std/map', '1'));
        const resourceHolderFieldLocal = field(resourceHolder, 'resourceValue');
        tx.createField(resourceHolderFieldLocal, 'Input');
        tx.lock(resourceHolder);

        resourceHolderField = await toGlobalFieldId(resourceHolderFieldLocal);

        return {
          resource: resourceHolderFieldLocal,
          fieldInfo: tx.createValue(Pl.JsonObject, JSON.stringify({
            name: 'nonExistentField',
            type: 'input',
            isEph: isEph,
          })),
          defaultValue: tx.createValue(Pl.JsonObject, JSON.stringify('default-value')),
        };
      },
    );

    await sleep(3);

    let actualResource: ResourceId | undefined = undefined;

    // Now create and set the actual resource with the field
    await pl.withWriteTx('setResource', async (tx) => {
      const actualResourceLocal = tx.createStruct(resourceType('std/map', '1'));
      actualResource = await toGlobalResourceId(actualResourceLocal);
      tx.setField(resourceHolderField!, actualResourceLocal);
      await tx.commit();
    });

    await sleep(3);

    // Now create and set the actual resource with the field
    await pl.withWriteTx('setField', async (tx) => {
      tx.createField(field(actualResource!, 'x'), 'Input');
      tx.setField(
        field(actualResource!, 'x'),
        tx.createValue(Pl.JsonObject, JSON.stringify('delayed-resource-value')),
      );
      await tx.commit();
    });

    await sleep(3);

    // Now create and set the actual resource with the field
    await pl.withWriteTx('setField', async (tx) => {
      tx.lock(actualResource!);
      await tx.commit();
    });

    // Check that we get the field value from the resource that appeared later
    const fieldResult = result.computeOutput('result', (a) => a?.getDataAsJson());
    expect(await fieldResult.awaitStableValue()).toBe('default-value');
  },
);
