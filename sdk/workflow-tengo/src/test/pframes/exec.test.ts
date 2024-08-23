import { field, Pl } from '@milaboratory/pl-middle-layer';
import { awaitStableState, tplTest } from '@milaboratory/sdk-test';

const csvData = `a,b,c,d,e
1,2,3,4,9
4,5,6,5,9
7,8,9,6,2`;

const params = {
  axes: [
    {
      column: 'a',
      spec: {
        name: 'pl7.app/a',
        type: 'Long'
      }
    },
    {
      column: 'd',
      spec: {
        name: 'pl7.app/d',
        type: 'Long'
      }
    },
    {
      column: 'e',
      spec: {
        name: 'pl7.app/e',
        type: 'Long'
      }
    }
  ],
  columns: [
    {
      column: 'b',
      id: 'b',
      name: 'b',
      type: 'String',
      annotations: {
        a: 'v'
      }
    },
    {
      column: 'c',
      id: 'c',
      name: 'c',
      type: 'String',
      annotations: {
        a: 'v'
      }
    }
  ],

  storageFormat: 'Binary',

  partitionKeyLength: 1
};

tplTest(
  'should read p-frame from csv files map',
  { timeout: 10000 },
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      'test.pframes.read_csv_map',
      ['pf'],
      (tx) => {
        const csv = tx.createValue(Pl.JsonObject, JSON.stringify(csvData));

        const map = tx.createStruct(Pl.StdMap);
        tx.createField(field(map, 'X'), 'Input', csv);
        tx.createField(field(map, 'Y'), 'Input', csv);
        tx.lockInputs(map);

        return {
          csvMap: map,
          params: tx.createValue(Pl.JsonObject, JSON.stringify(params))
        };
      }
    );
    // const r = await result
    //   .computeOutput('pf', (a) => a?.listInputFields())
    //   .awaitStableFullValue();

    console.log(
      await awaitStableState(
        result.computeOutput('pf', (pf) => pf?.listInputFields())
      )
    );

    console.log(
      await awaitStableState(
        result.computeOutput('pf', (pf) => pf?.traverse('b')?.listInputFields())
      )
    );

    console.log(
      await awaitStableState(
        result.computeOutput('pf', (pf) => pf?.traverse('b', 'X')?.listInputFields())
      )
    );

    // console.log(
    //   await awaitStableState(
    //     result.computeOutput('pf', (pf) =>
    //       pf?.traverse('b', 'X')?.listInputFields()
    //     )
    //   )
    // );

    // console.log(
    //   await result
    //     .computeOutput('pf', (pf) =>
    //       pf?.getField('Y')?.value?.listInputFields()
    //     )
    //     .awaitStableFullValue()
    // );

    // expect(await mainResult.awaitStableValue()).eq('Hello from bash\n');
  }
);

tplTest('should read p-frame from csv file', async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    'test.pframes.read_csv',
    ['pf'],
    (tx) => ({
      csv: tx.createValue(Pl.JsonObject, JSON.stringify(csvData)),
      params: tx.createValue(Pl.JsonObject, JSON.stringify(params))
    })
  );
  // const r = await result
  //   .computeOutput('pf', (a) => a?.listInputFields())
  //   .awaitStableFullValue();

  console.log(
    await result
      .computeOutput('pf', (pf) => pf?.getField('b')?.value?.getDataAsString())
      .awaitStableFullValue()
  );

  console.log(
    await result
      .computeOutput('pf', (pf, ctx) =>
        pf?.getField('b')?.value?.getDataAsString()
      )
      .awaitStableFullValue()
  );

  // expect(await mainResult.awaitStableValue()).eq('Hello from bash\n');
});
