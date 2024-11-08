import { field, Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';

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
        type: 'String',
        annotations: {
          'pl7.app/label': 'ax1'
        }
      }
    },
    {
      column: 'ax2',
      spec: {
        name: 'ax2',
        type: 'String',
        annotations: {
          'pl7.app/label': 'ax2'
        }
      }
    },
    {
      column: 'ax3',
      spec: {
        name: 'ax3',
        type: 'String',
        annotations: {
          'pl7.app/label': 'ax3'
        }
      }
    }
  ],
  columns: [
    {
      column: 'col1',
      id: 'col1',
      spec: {
        valueType: 'String',
        name: 'col1',
        annotations: {
          'pl7.app/label': 'col1'
        }
      }
    },
    {
      column: 'col2',
      id: 'col2',
      spec: {
        valueType: 'String',
        name: 'col2',
        annotations: {
          'pl7.app/label': 'col2'
        }
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

tplTest.for([
  { partitionKeyLength: 0, storageFormat: 'Binary' },
  { partitionKeyLength: 1, storageFormat: 'Binary' },
  { partitionKeyLength: 2, storageFormat: 'Binary' },
  { partitionKeyLength: 0, storageFormat: 'Json' },
  { partitionKeyLength: 1, storageFormat: 'Json' },
  { partitionKeyLength: 2, storageFormat: 'Json' }
])(
  'should export p-frame to csv file for partitionKeyLength = $partitionKeyLength ( $storageFormat )',
  { timeout: 15000 },
  async ({ partitionKeyLength, storageFormat }, { helper, expect, driverKit }) => {
    var spec = baseSpec;
    spec.partitionKeyLength = partitionKeyLength;
    spec.storageFormat = storageFormat;

    const result = await helper.renderTemplate(
      false,
      'pframes.test.xsv.export-pf',
      ['tsvFile'],
      (tx) => ({
        csv: tx.createValue(Pl.JsonObject, JSON.stringify(csvData)),
        spec: tx.createValue(Pl.JsonObject, JSON.stringify(spec))
      })
    );

    const tsv = await awaitStableState(
      result.computeOutput('tsvFile', (f, ctx) => {
        if (!f) {
          return undefined;
        }
        const h = driverKit.blobDriver.getOnDemandBlob(f.persist(), ctx);

        return h.handle;
      })
    );

    const csvContent = (await driverKit.blobDriver.getContent(tsv!)).toString();

    // @TODO remove \" replacement after pfconv update
    const actual = csvContent.replaceAll('"', '').replaceAll('\n', '').split('').sort();
    const expected = csvData.replaceAll('\n', '').split('').sort();

    // console.log(actual);
    // console.log(expected);

    // console.log(csvContent);
    // console.log(csvData);

    expect(actual).toEqual(expected);
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
  'should export super-partitioned p-frame to csv file - superPartitionKeyLength: $superPartitionKeyLength, partitionKeyLength: $partitionKeyLength',
  { timeout: 30000 },
  async (
    { superPartitionKeyLength, partitionKeyLength, storageFormat },
    { helper, expect, driverKit }
  ) => {
    const supKeys = superPartitionKeys(superPartitionKeyLength).sort();
    var spec = baseSpec;
    spec.partitionKeyLength = partitionKeyLength;
    spec.storageFormat = storageFormat;

    const result = await helper.renderTemplate(
      false,
      'pframes.test.xsv.export-super-pf',
      ['tsvFile'],
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

    const tsv = await awaitStableState(
      result.computeOutput('tsvFile', (f, ctx) => {
        if (!f) {
          return undefined;
        }
        const h = driverKit.blobDriver.getOnDemandBlob(f.persist(), ctx);

        return h.handle;
      })
    );

    const csvContent = (await driverKit.blobDriver.getContent(tsv!)).toString();

    // @TODO remove \" replacement after pfconv update
    const actual = csvContent.replaceAll('"', '').replaceAll('\n', '').split('').sort();
    const expected = csvData.replaceAll('\n', '').split('').sort();

    // console.log(actual);
    // console.log(expected);

    // console.log(csvContent);
    // console.log(csvData);

    if (superPartitionKeyLength === 0) expect(actual).toEqual(expected);
  }
);
