import type { FieldId } from '@milaboratories/pl-middle-layer';
import { field, Pl, resourceType, toGlobalFieldId } from '@milaboratories/pl-middle-layer';
import { sleep } from '@milaboratories/ts-helpers';
import { tplTest } from '@platforma-sdk/test';

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral mode' },
  { isEph: false, name: 'pure field' },
])(
  'should resolve future output field with default value: field exists ($name)',
  async ({ isEph }, { helper, expect }) => {
    // Create a sample resource with fields
    const result = await helper.renderTemplate(
      true,
      'll.test-get-output-field',
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
            path: ['result', 'x'],
            isEph: isEph,
          })),
        };
      },
    );

    // Check that we get the actual field value when it exists
    const fieldResult = result.computeOutput('result', (a) => a?.getDataAsJson());
    expect(await fieldResult.awaitStableValue()).toBe('value-exists');
  },
);

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral mode' },
  { isEph: false, name: 'pure field' },
])(
  'should resolve future output field with default value: output field does not exist ($name)',
  async ({ isEph }, { helper, expect }) => {
    // Create a sample resource with fields
    const result = await helper.renderTemplate(
      true,
      'll.test-get-output-field',
      ['result'],
      (tx) => {
        const resourceWithField = tx.createStruct(resourceType('std/map', '1'));
        tx.createField(field(resourceWithField, 'y'), 'Input');
        tx.setField(
          field(resourceWithField, 'y'),
          tx.createValue(Pl.JsonObject, JSON.stringify('value-exists-1')),
        );
        tx.lock(resourceWithField);
        return {
          resource: resourceWithField,
          fieldInfo: tx.createValue(Pl.JsonObject, JSON.stringify({
            path: [{ name: 'notResult', optional: true }, 'x'],
            isEph: isEph,
          })),
        };
      },
    );

    // Check that we get the actual field value when it exists
    const fieldResult = result.computeOutput('result', (a) => a?.resourceType.name);
    expect(await fieldResult.awaitStableValue()).toBe('Null');
  },
);

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral mode' },
  { isEph: false, name: 'pure field' },
])(
  'should resolve future output field with default value: output field does not exist, delayed ($name)',
  async ({ isEph }, { helper, pl, expect }) => {
    let targetInput: FieldId | undefined = undefined;
    const result = await helper.renderTemplate(
      true,
      'll.test-get-output-field',
      ['result'],
      async (tx) => {
        // Create a placeholder resource to hold our actual resource
        const resourceHolder = tx.createStruct(resourceType('std/map', '1'));
        const resourceHolderFieldLocal = field(resourceHolder, 'resourceValue');
        tx.createField(resourceHolderFieldLocal, 'Input');
        tx.lock(resourceHolder);

        targetInput = await toGlobalFieldId(resourceHolderFieldLocal);

        return {
          resource: resourceHolderFieldLocal,
          fieldInfo: tx.createValue(Pl.JsonObject, JSON.stringify({
            path: [{ name: 'notResult', optional: true }, 'x'],
            isEph: isEph,
          })),
        };
      },
    );

    await sleep(20);

    await pl.withWriteTx('setField', async (tx) => {
      const resourceWithField = tx.createStruct(resourceType('std/map', '1'));
      tx.createField(field(resourceWithField, 'y'), 'Input');
      tx.setField(
        field(resourceWithField, 'y'),
        tx.createValue(Pl.JsonObject, JSON.stringify('value-exists-1')),
      );
      tx.lock(resourceWithField);
      tx.setField(targetInput!, resourceWithField);
      tx.commit();
    });

    // Check that we get the actual field value when it exists
    const fieldResult = result.computeOutput('result', (a) => a?.resourceType.name);
    expect(await fieldResult.awaitStableValue()).toBe('Null');
  },
);

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral mode' },
  { isEph: false, name: 'pure field' },
])(
  'should resolve future output field with default value: nested field does not exist ($name)',
  async ({ isEph }, { helper, expect }) => {
    // Create a sample resource with fields
    const result = await helper.renderTemplate(
      true,
      'll.test-get-output-field',
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
            path: ['result', { name: 'y', optional: true }],
            isEph: isEph,
          })),
        };
      },
    );

    // Check that we get the actual field value when it exists
    const fieldResult = result.computeOutput('result', (a) => a?.resourceType.name);
    expect(await fieldResult.awaitStableValue()).toBe('Null');
  },
);
