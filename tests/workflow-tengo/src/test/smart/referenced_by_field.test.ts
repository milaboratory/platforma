import { field, Pl, PlResourceEntry, resourceType } from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';
import { PlTreeNodeAccessor } from '@milaboratories/pl-tree';

tplTest('should get the resource by a field it was got from', async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    'test.smart.resource_was_referenced_by_field',
    ["outputRes", "outputField"],
    (tx) => {
      const res = tx.createStruct(
        resourceType('TestNotExistingType1', '1'),
        JSON.stringify(42),
      );
      tx.lockInputs(res);
      return { res };
    }
  );

  const resResult = result.computeOutput('outputRes', (a) => a?.getDataAsJson<number>());
  const fieldResult = result.computeOutput('outputField', (a) => a?.getDataAsJson<number>());

  expect(await resResult.awaitStableValue()).eq(42);
  expect(await fieldResult.awaitStableValue()).eq(42);
});

tplTest('should get the map by a field and from a cache', async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    'test.smart.map_was_referenced_by_field',
    ["outputMap", "outputFromCache", "outputField"],
    (tx) => {
      const map = tx.createStruct(Pl.StdMap);
      const answer = tx.createValue(Pl.JsonObject, JSON.stringify(42));
      tx.createField(field(map, 'answer'), 'Input', answer);
      tx.lockInputs(map);

      return {
        mapResource: map
      }
    }
  );

  const getFromMap = (a?: PlTreeNodeAccessor) =>
    a?.getField('answer')?.value?.getDataAsJson<number>()

  const mapResult = result.computeOutput('outputMap', getFromMap);
  const cacheResult = result.computeOutput('outputFromCache', getFromMap);
  const fieldResult = result.computeOutput('outputField', getFromMap);

  expect(await mapResult.awaitStableValue()).eq(42);
  expect(await cacheResult.awaitStableValue()).eq(42);
  expect(await fieldResult.awaitStableValue()).eq(42);
});
