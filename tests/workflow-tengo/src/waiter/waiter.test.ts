import type {
  AnyFieldRef,
  ResourceId } from '@milaboratories/pl-middle-layer';
import {
  Pl,
  field,
  resourceType,
  toGlobalResourceId,
} from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';
import { Templates } from '../..';

tplTest('test waiter 1', async ({ pl, helper, expect }) => {
  let waitResource: ResourceId = 0n as ResourceId; // hack
  let passResource: ResourceId = 0n as ResourceId; // hack
  const result = await helper.renderTemplate(
    true,
    Templates['waiter.waiter'],
    ['output'],
    async (tx) => {
      passResource = await toGlobalResourceId(
        // We need to be sure any resource is transitioned to the output.
        // It is not necessary to be ready.
        tx.createStruct(resourceType('TestPass', '1')),
      );

      waitResource = await toGlobalResourceId(
        tx.createStruct(resourceType('TestWait', '1')),
      );

      return {
        pass: passResource,
        wait: waitResource,
      };
    },
  );
  const outputResult = result.computeOutput('output', (a) => a?.id);
  await outputResult.refreshState();
  expect(await outputResult.getValue()).toBeUndefined();

  await pl.withWriteTx('CheckWaiter', async (tx) => {
    tx.createField(field(waitResource, 'nestedField'), 'Input');
    await tx.commit();
  });
  await outputResult.refreshState();
  expect(await outputResult.getValue()).toBeUndefined();

  await pl.withWriteTx('CheckWaiter', async (tx) => {
    tx.lockInputs(waitResource);
    await tx.commit();
  });
  await outputResult.refreshState();
  expect(await outputResult.getValue()).toBeUndefined();

  await pl.withWriteTx('Test', async (tx) => {
    tx.setField(
      field(waitResource, 'nestedField'),
      tx.createValue(Pl.JsonObject, '{}'),
    );
    await tx.commit();
  });
  await outputResult.refreshState();
  expect(await outputResult.awaitStableValue()).eq(passResource);
});

tplTest('test waiter 2', async ({ pl, helper, expect }) => {
  let passField: AnyFieldRef;
  const result = await helper.renderTemplate(
    true,
    Templates['waiter.waiter'],
    ['output'],
    async (tx) => {
      const waitResource = await toGlobalResourceId(
        tx.createStruct(resourceType('TestWait', '1')),
      );
      tx.lockInputs(waitResource);

      passField = field(waitResource, 'pass');
      tx.createField(passField, 'OTW');
      tx.lockOutputs(waitResource);

      return {
        pass: passField,
        wait: waitResource,
      };
    },
  );
  const outputResult = result.computeOutput('output', (a) => a?.id);
  await outputResult.refreshState();
  expect(await outputResult.getValue()).toBeUndefined();

  let passResource: ResourceId = 0n as ResourceId; // hack

  await pl.withWriteTx('CreatePass', async (tx) => {
    passResource = await toGlobalResourceId(
      tx.createEphemeral(resourceType('TestWait', '1')),
    );

    tx.setField(passField, passResource);
    await tx.commit();
  });

  await outputResult.refreshState();
  expect(await outputResult.awaitStableValue()).eq(passResource);
});
