import { field, Pl, resourceType } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';
import { Templates as SdkTemplates } from '@platforma-sdk/workflow-tengo';

tplTest.for([
  { isEph: true, name: 'ephemeral mode' },
  { isEph: false, name: 'pure mode' },
])(
  'should correctly execute pframes.remove-nulls ($name)',
  { timeout: 10000 },
  async ({ isEph }, { helper, expect }) => {
    const result = await helper.renderTemplate(
      isEph,
      SdkTemplates['pframes.remove-nulls'],
      ['result'],
      (tx) => {
        const inputMap = tx.createStruct(
          resourceType('PColumnData/ResourceMap', '1'),
          JSON.stringify({
            keyLength: 1,
          }),
        );
        tx.createField(field(inputMap, '[1]'), 'Input', tx.createValue(Pl.JsonObject, JSON.stringify({ a: 1 })));
        tx.createField(field(inputMap, '[2]'), 'Input', tx.createValue(Pl.RNull, ''));
        tx.createField(field(inputMap, '[3]'), 'Input', tx.createValue(Pl.JsonObject, JSON.stringify({ a: 3 })));
        tx.lockInputs(inputMap);
        return { map: inputMap };
      },
    );

    const resultMapLength = await awaitStableState(result.computeOutput('result', (a) => {
      const fields = a?.listInputFields();
      return Object.fromEntries(fields?.map((f) => [f, a?.traverse(f)?.getDataAsJson()]) ?? []);
    }));
    expect(resultMapLength).toStrictEqual({
      '[1]': { a: 1 },
      '[3]': { a: 3 },
    });
  },
);
