import { field, Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';
import { Templates } from '../../../dist';

// dummy csv data
const csvData = `ax1,ax2,ax3,col1,col2
A1,B1,C1,X1,Y1
A2,B2,C2,X2,Y2
A3,B2,C3,X3,Y3`;

// map xsv header -> xsv column content
const csvDataMap = (() => {
  const lines = csvData.split('\n');
  const header = lines[0].split(',');

  const cols = new Map<string, string[]>();
  for (const h of header) {
    cols.set(h, []);
  }

  for (var iRow = 0; iRow < lines.length - 1; ++iRow) {
    const line = lines[iRow + 1].split(',');

    for (var iCol = 0; iCol < header.length; ++iCol) {
      cols.get(header[iCol])?.push(line[iCol]);
    }
  }

  return cols;
})();

// number of payload rows (excluding header) in csv file
const csvNRows = (() => {
  for (const e of csvDataMap) {
    return e[1].length;
  }
  return 0;
})();

// pfconv spec
const baseSpec = {
  axes: [
    {
      column: 'ax1',
      spec: {
        name: 'ax1',
        type: 'String'
      }
    },
    {
      column: 'ax2',
      spec: {
        name: 'ax2',
        type: 'String'
      }
    },
    {
      column: 'ax3',
      spec: {
        name: 'ax3',
        type: 'String'
      }
    }
  ],
  columns: [
    {
      column: 'col1',
      id: 'col1',
      spec: {
        valueType: 'String'
      }
    },
    {
      column: 'col2',
      id: 'col2',
      spec: {
        valueType: 'String'
      }
    }
  ],

  storageFormat: 'Binary',

  partitionKeyLength: 2
};

// partition keys values as Json encoded strings
const expectedPartitionKeys = function (spec: typeof baseSpec) {
  const r = [] as string[];
  if (spec.partitionKeyLength == 0) {
    r.push(JSON.stringify([]));
    return r;
  }

  for (let i = 0; i < csvNRows; ++i) {
    const row: string[] = [];
    for (let j = 0; j < spec.partitionKeyLength; ++j) {
      const axis = csvDataMap.get(spec.axes[j].column)!;
      row.push(axis[i]);
    }
    r.push(JSON.stringify(row));
  }

  return r;
};

// key name as written in the resource without 'index'/'values' suffix
function partitionKeyJson(str: string): any {
  // double conversion for assertion
  return JSON.stringify(JSON.parse(str.replace('.index', '').replace('.values', '')));
}

tplTest.for([
  { partitionKeyLength: 0, storageFormat: 'Binary' },
  { partitionKeyLength: 1, storageFormat: 'Binary' },
  { partitionKeyLength: 2, storageFormat: 'Binary' },
  { partitionKeyLength: 0, storageFormat: 'Json' },
  { partitionKeyLength: 1, storageFormat: 'Json' },
  { partitionKeyLength: 2, storageFormat: 'Json' }
])(
  'should read p-frame from csv file for partitionKeyLength = $partitionKeyLength ( $storageFormat )',
  { timeout: 15000 },
  async ({ partitionKeyLength, storageFormat }, { helper, expect, driverKit }) => {
    var spec = baseSpec;
    spec.partitionKeyLength = partitionKeyLength;
    spec.storageFormat = storageFormat;
    const expectedPKeys = [...expectedPartitionKeys(spec)].sort();

    const result = await helper.renderTemplate(
      false,
      'pframes.test.xsv.import-csv',
      ['pf'],
      (tx) => ({
        csv: tx.createValue(Pl.JsonObject, JSON.stringify(csvData)),
        spec: tx.createValue(Pl.JsonObject, JSON.stringify(spec))
      })
    );

    const cols = (
      await awaitStableState(
        result.computeOutput('pf', (pf) => pf?.listInputFields()),
        10000
      )
    )?.sort();

    const expected = ['col1.data', 'col1.spec', 'col2.data', 'col2.spec'].sort();
    expect(cols).toStrictEqual(expected);

    for (const colName of ['col1', 'col2']) {
      const colOpt = await awaitStableState(
        result.computeOutput('pf', (pf) => {
          const r = pf?.traverse(colName + '.data');
          return {
            type: r?.resourceType.name,
            data: r?.getDataAsJson(),
            fields: r?.listInputFields()
          };
        }),
        6000
      );

      expect(colOpt).toBeDefined();

      const col = colOpt!;

      expect(col.type).toEqual('PColumnData/' + spec.storageFormat + 'Partitioned');

      expect(col.data).toEqual({ partitionKeyLength: spec.partitionKeyLength });

      const keys = [...new Set(col?.fields?.map(partitionKeyJson))].sort();

      expect(keys).toEqual(expectedPKeys);

      if (storageFormat == 'Json') {
        if (partitionKeyLength == 0) {
          const dataOpt = await awaitStableState(
            result.computeOutput('pf', (pf, ctx) => {
              const r = pf?.traverse(colName + '.data', JSON.stringify([]));
              if (r === undefined) {
                return r;
              }
              return driverKit.blobDriver.getOnDemandBlob(r.persist(), ctx).handle;
            }),
            6000
          );

          const data = JSON.parse(
            Buffer.from(await driverKit.blobDriver.getContent(dataOpt!)).toString('utf-8')
          );

          const values = Object.keys(data)
            .map((key) => data[key])
            .sort();

          const expectedPValues = csvDataMap.get(colName)!.sort();

          expect(values).toEqual(expectedPValues);
        }
      } else {
        // @TODO test
      }
    }
  }
);

function superPartitionKeys(keyLen: number): string[] {
  const base = ['X', 'Y', 'Z'];
  const r: string[] = [];
  if (keyLen == 0) {
    r.push(JSON.stringify([]));
    return r;
  }

  for (let i = 0; i < base.length; ++i) {
    const row: string[] = [];
    for (let j = 0; j < keyLen; ++j) {
      row.push(base[i] + j);
    }
    r.push(JSON.stringify(row));
  }
  return r;
}

tplTest.for([
  {
    superPartitionKeyLength: 0,
    partitionKeyLength: 0,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 0,
    partitionKeyLength: 1,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 0,
    partitionKeyLength: 2,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 1,
    partitionKeyLength: 0,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 1,
    partitionKeyLength: 1,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 1,
    partitionKeyLength: 2,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 2,
    partitionKeyLength: 0,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 2,
    partitionKeyLength: 1,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 2,
    partitionKeyLength: 2,
    storageFormat: 'Binary'
  },

  { superPartitionKeyLength: 0, partitionKeyLength: 0, storageFormat: 'Json' },
  { superPartitionKeyLength: 0, partitionKeyLength: 1, storageFormat: 'Json' },
  { superPartitionKeyLength: 1, partitionKeyLength: 0, storageFormat: 'Json' },
  { superPartitionKeyLength: 1, partitionKeyLength: 1, storageFormat: 'Json' }
])(
  'should read super-partitioned p-frame from csv files map- superPartitionKeyLength: $superPartitionKeyLength, partitionKeyLength: $partitionKeyLength',
  { timeout: 10000 },
  async ({ superPartitionKeyLength, partitionKeyLength, storageFormat }, { helper, expect }) => {
    const supKeys = superPartitionKeys(superPartitionKeyLength).sort();
    var spec = baseSpec;
    spec.partitionKeyLength = partitionKeyLength;
    spec.storageFormat = storageFormat;
    // inner keys
    const expectedPKeys = [...expectedPartitionKeys(spec)].sort();

    const result = await helper.renderTemplate(
      false,
      'pframes.test.xsv.import-csv-map',
      ['pf'],
      (tx) => {
        const csv = tx.createValue(Pl.JsonObject, JSON.stringify(csvData));

        const map = tx.createStruct(Pl.StdMap);
        for (const supK of supKeys) {
          tx.createField(field(map, supK), 'Input', csv);
        }
        tx.lockInputs(map);

        return {
          csvMap: map,
          keyLength: tx.createValue(Pl.JsonObject, JSON.stringify(superPartitionKeyLength)),
          spec: tx.createValue(Pl.JsonObject, JSON.stringify(spec))
        };
      }
    );

    for (const colName of ['col1', 'col2']) {
      const colOpt = await awaitStableState(
        result.computeOutput('pf', (pf) => {
          const r = pf?.traverse(colName + '.data');
          return {
            type: r?.resourceType.name,
            data: r?.getDataAsJson(),
            fields: r?.listInputFields()
          };
        }),
        6000
      );

      expect(colOpt).toBeDefined();

      const col = colOpt!;

      var expectedResourceType: string;
      var expectedData: object;
      if (superPartitionKeyLength > 0 && partitionKeyLength > 0) {
        expectedResourceType = 'PColumnData/Partitioned/' + spec.storageFormat + 'Partitioned';
        expectedData = {
          superPartitionKeyLength: superPartitionKeyLength,
          partitionKeyLength: partitionKeyLength
        };
      } else {
        expectedResourceType = 'PColumnData/' + spec.storageFormat + 'Partitioned';
        expectedData = {
          partitionKeyLength: Math.max(superPartitionKeyLength, partitionKeyLength)
        };
      }

      expect(col.type).toEqual(expectedResourceType);
      expect(col.data).toEqual(expectedData);

      const keys = [...new Set(col?.fields?.map(partitionKeyJson))].sort();
      if (superPartitionKeyLength > 0 && partitionKeyLength > 0) {
        expect(keys).toEqual(supKeys);
        for (const sk of supKeys) {
          const colOpt = await awaitStableState(
            result.computeOutput('pf', (pf) => {
              const r = pf?.traverse(colName + '.data', sk);
              return {
                type: r?.resourceType.name,
                data: r?.getDataAsJson(),
                fields: r?.listInputFields()
              };
            }),
            6000
          );

          expect(colOpt).toBeDefined();

          const col = colOpt!;

          expect(col.type).toEqual('PColumnData/' + spec.storageFormat + 'Partitioned');

          expect(col.data).toEqual({
            partitionKeyLength: spec.partitionKeyLength
          });

          const keys = [...new Set(col?.fields?.map(partitionKeyJson))].sort();

          expect(keys).toEqual(expectedPKeys);

          if (storageFormat == 'Json') {
            // @TODO test data
          }
        }
      } else if (superPartitionKeyLength == 0) {
        const keys = [...new Set(col?.fields?.map(partitionKeyJson))].sort();

        expect(keys).toEqual(expectedPKeys);
      } else if (partitionKeyLength == 0) {
        const keys = [...new Set(col?.fields?.map(partitionKeyJson))].sort();

        expect(keys).toEqual(supKeys);
      }
    }
  }
);

tplTest.for([
  {
    superPartitionKeyLength: 0,
    partitionKeyLength: 0,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 0,
    partitionKeyLength: 1,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 0,
    partitionKeyLength: 2,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 1,
    partitionKeyLength: 0,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 1,
    partitionKeyLength: 1,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 1,
    partitionKeyLength: 2,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 2,
    partitionKeyLength: 0,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 2,
    partitionKeyLength: 1,
    storageFormat: 'Binary'
  },
  {
    superPartitionKeyLength: 2,
    partitionKeyLength: 2,
    storageFormat: 'Binary'
  },

  { superPartitionKeyLength: 0, partitionKeyLength: 0, storageFormat: 'Json' },
  { superPartitionKeyLength: 0, partitionKeyLength: 1, storageFormat: 'Json' },
  { superPartitionKeyLength: 1, partitionKeyLength: 0, storageFormat: 'Json' },
  { superPartitionKeyLength: 1, partitionKeyLength: 1, storageFormat: 'Json' }
])(
  '[in workflow] should read super-partitioned p-frame from csv files map- superPartitionKeyLength: $superPartitionKeyLength, partitionKeyLength: $partitionKeyLength',
  { timeout: 10000 },
  async ({ superPartitionKeyLength, partitionKeyLength, storageFormat }, { helper, expect }) => {
    const supKeys = superPartitionKeys(superPartitionKeyLength).sort();
    var spec = baseSpec;
    spec.partitionKeyLength = partitionKeyLength;
    spec.storageFormat = storageFormat;
    // inner keys
    const expectedPKeys = [...expectedPartitionKeys(spec)].sort();

    const csvMap = Object.fromEntries(supKeys.map((supKey) => [supKey, csvData]));

    const result = await helper.renderWorkflow(
      Templates['pframes.test.xsv.import-csv-map-wf'],
      false,
      {
        csvMap: csvMap,
        keyLength: superPartitionKeyLength,
        spec
      },
      { exportProcessor: Templates['pframes.export-pframe'] }
    );

    for (const colName of ['col1', 'col2']) {
      const colOpt = await awaitStableState(
        result.export(`${colName}.data`, (r) => {
          return {
            type: r?.resourceType.name,
            data: r?.getDataAsJson(),
            fields: r?.listInputFields()
          };
        }),
        6000
      );

      expect(colOpt).toBeDefined();

      const col = colOpt!;

      var expectedResourceType: string;
      var expectedData: object;
      if (superPartitionKeyLength > 0 && partitionKeyLength > 0) {
        expectedResourceType = 'PColumnData/Partitioned/' + spec.storageFormat + 'Partitioned';
        expectedData = {
          superPartitionKeyLength: superPartitionKeyLength,
          partitionKeyLength: partitionKeyLength
        };
      } else {
        expectedResourceType = 'PColumnData/' + spec.storageFormat + 'Partitioned';
        expectedData = {
          partitionKeyLength: Math.max(superPartitionKeyLength, partitionKeyLength)
        };
      }

      expect(col.type).toEqual(expectedResourceType);
      expect(col.data).toEqual(expectedData);

      const keys = [...new Set(col?.fields?.map(partitionKeyJson))].sort();
      if (superPartitionKeyLength > 0 && partitionKeyLength > 0) {
        expect(keys).toEqual(supKeys);
        for (const sk of supKeys) {
          const colOpt = await awaitStableState(
            result.export(`${colName}.data`, (pc) => {
              const r = pc?.traverse(sk);
              return {
                type: r?.resourceType.name,
                data: r?.getDataAsJson(),
                fields: r?.listInputFields()
              };
            }),
            6000
          );

          expect(colOpt).toBeDefined();

          const col = colOpt!;

          expect(col.type).toEqual('PColumnData/' + spec.storageFormat + 'Partitioned');

          expect(col.data).toEqual({
            partitionKeyLength: spec.partitionKeyLength
          });

          const keys = [...new Set(col?.fields?.map(partitionKeyJson))].sort();

          expect(keys).toEqual(expectedPKeys);

          if (storageFormat == 'Json') {
            // @TODO test data
          }
        }
      } else if (superPartitionKeyLength == 0) {
        const keys = [...new Set(col?.fields?.map(partitionKeyJson))].sort();

        expect(keys).toEqual(expectedPKeys);
      } else if (partitionKeyLength == 0) {
        const keys = [...new Set(col?.fields?.map(partitionKeyJson))].sort();

        expect(keys).toEqual(supKeys);
      }
    }
  }
);
