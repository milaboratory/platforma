import { Pl } from '@milaboratory/pl-middle-layer';
import { tplTest } from '@milaboratory/sdk-test';

tplTest('test simple template', async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    'test.tpl.simple1',
    ['main'],
    (tx) => ({
      input1: tx.createValue(
        Pl.JsonObject,
        JSON.stringify({ testValue: 'Truman' })
      )
    })
  );
  const mainResult = result.computeOutput('main', (a) => a?.getDataAsJson());
  expect(await mainResult.awaitStableValue()).eq('Truman Show');
});

tplTest('test template with maps output', async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    'test.tpl.map-outputs',
    ['simpleMap', 'strictMap'],
    (tx) => ({})
  );

  const simpleMap = (await result
    .computeOutput('simpleMap', (a) => a?.getDataAsJson())
    .awaitStableValue()) as Record<string, string>;
  expect(simpleMap['a']).eq('a');

  const strictMap = (await result
    .computeOutput('strictMap', (a) => a?.getDataAsJson())
    .awaitStableValue()) as Record<string, string>;
  expect(strictMap['a']).eq('a');
});

tplTest(
  'test template json encoded strings in keys',
  async ({ helper, expect }) => {
    const key = '{"a":"b"}';
    const result = await helper.renderTemplate(
      false,
      'test.tpl.json-keys',
      [key],
      (tx) => ({})
    );

    const r = await result
      .computeOutput(key, (a) => a?.getDataAsJson())
      .awaitStableValue();
    console.dir(r, { depth: 5 });
    expect(r).eq('a');
  }
);
