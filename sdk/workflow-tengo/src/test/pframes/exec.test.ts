import { Pl } from '@milaboratory/pl-middle-layer';
import { tplTest } from '@milaboratory/sdk-test';

const csvData = `a,b,c
1,2,3
4,5,6
7,8,9`;

tplTest('should read p-frame from csv', async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    'test.pframes.read_pf_from_csv',
    ['pf'],
    (tx) => ({
      csv: tx.createValue(Pl.JsonObject, JSON.stringify(csvData)),
      params: tx.createValue(
        Pl.JsonObject,
        JSON.stringify({
          axes: [
            {
              column: 'a',
              spec: {
                name: 'pl7.app/readId',
                type: 'Long'
              }
            }
          ],
          columns: [
            {
              column: 'b',
              type: 'String',
              annotations: {
                a: 'v'
              }
            }
          ],
          include: ['b'],

          storageFormat: 'Binary',

          index: null
        })
      )
    })
  );
  // const r = await result
  //   .computeOutput('pf', (a) => a?.listInputFields())
  //   .awaitStableFullValue();

  console.log(
    await result
      .computeOutput('pf', (a, ctx) =>
        a?.getField('b')?.value?.getDataAsString()
      )
      .awaitStableFullValue()
  );

  console.log(
    await result
      .computeOutput('pf', (a, ctx) => {
        const v = a?.getField('b')?.value;
        if (!v) {
          return undefined;
        }
        if (!v.getInputsLocked()) {
          ctx.markUnstable();
        }
        return v?.listInputFields();
      })
      .awaitStableFullValue()
  );

  // expect(await mainResult.awaitStableValue()).eq('Hello from bash\n');
});
