import { Pl, field, resourceType } from '@milaboratory/pl-middle-layer';
import { awaitStableState, tplTest } from '@milaboratory/sdk-test';

tplTest(
  'should correctly execute low level aggregation routine',
  { timeout: 10000 },
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'test.pframes.ll_agg_1',
      ['result'],
      (tx) => {
        const v1 = tx.createValue(Pl.JsonObject, JSON.stringify(1));

        const data = tx.createStruct(
          resourceType('PColumnData/ResourceMap', '1'),
          JSON.stringify({
            keyLength: 2
          })
        );
        tx.createField(field(data, '[1, 1]'), 'Input', v1);
        tx.createField(field(data, '[1, 2]'), 'Input', v1);
        tx.lockInputs(data);

        return {
          params: tx.createValue(
            Pl.JsonObject,
            JSON.stringify({
              indices: [0],
              eph: false
            })
          ),
          data: data
        };
      }
    );
    const r = result.computeOutput('result', (a) => a?.getDataAsJson());
    console.dir(await awaitStableState(r));
  }
);
