import type { FieldId } from '@milaboratories/pl-middle-layer';
import { Pl, field, resourceType, toGlobalFieldId } from '@milaboratories/pl-middle-layer';
import { sleep } from '@milaboratories/ts-helpers';
import { tplTest } from '@platforma-sdk/test';

tplTest(
  'should resolve future field with default value: field exists',
  { timeout: 10000 },
  async ({ helper, expect }) => {
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
          fieldName: tx.createValue(Pl.JsonObject, JSON.stringify('x')),
          fieldType: tx.createValue(Pl.JsonObject, JSON.stringify('input')),
          defaultValue: tx.createValue(Pl.JsonObject, JSON.stringify('default-value')),
        };
      },
    );

    // Check that we get the actual field value when it exists
    const fieldResult = result.computeOutput('result', (a) => a?.getDataAsJson());
    expect(await fieldResult.awaitStableValue()).toBe('value-exists');
  },
);

tplTest(
  'should resolve future field with default value: field does not exist',
  { timeout: 10000 },
  async ({ helper, expect }) => {
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
          fieldName: tx.createValue(Pl.JsonObject, JSON.stringify('nonExistentField')),
          fieldType: tx.createValue(Pl.JsonObject, JSON.stringify('input')),
          defaultValue: tx.createValue(Pl.JsonObject, JSON.stringify('default-value')),
        };
      },
    );

    // Check that we get the default value when field doesn't exist
    const fieldResult = result.computeOutput('result', (a) => a?.getDataAsJson());
    expect(await fieldResult.awaitStableValue()).toBe('default-value');
  },
);

tplTest(
  'should resolve future field with default value: field does not exist & default appears later',
  { timeout: 10000 },
  async ({ helper, pl, expect }) => {
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
          fieldName: tx.createValue(Pl.JsonObject, JSON.stringify('nonExistentField')),
          fieldType: tx.createValue(Pl.JsonObject, JSON.stringify('input')),
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

tplTest(
  'should resolve future field with default value: when target resource appears later',
  { timeout: 10000 },
  async ({ helper, pl, expect }) => {
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
          fieldName: tx.createValue(Pl.JsonObject, JSON.stringify('x')),
          fieldType: tx.createValue(Pl.JsonObject, JSON.stringify('input')),
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
