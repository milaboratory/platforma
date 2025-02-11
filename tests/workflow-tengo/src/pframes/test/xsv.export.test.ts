import { field, Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';

// dummy csv data
const csvData = `ax1,ax2,ax3,col1,col2
A1,B1,C1,X1,Y1
A2,B2,C2,X2,Y2
A3,B2,C3,X3,Y3`;

// pfconv spec
const baseSpec = {
  axes: [
    {
      column: 'ax1',
      spec: {
        name: 'ax1',
        type: 'String',
        annotations: {
          'pl7.app/label': 'ax1',
        },
      },
    },
    {
      column: 'ax2',
      spec: {
        name: 'ax2',
        type: 'String',
        annotations: {
          'pl7.app/label': 'ax2',
        },
      },
    },
    {
      column: 'ax3',
      spec: {
        name: 'ax3',
        type: 'String',
        annotations: {
          'pl7.app/label': 'ax3',
        },
      },
    },
  ],
  columns: [
    {
      column: 'col1',
      id: 'col1',
      spec: {
        valueType: 'String',
        name: 'col1',
        annotations: {
          'pl7.app/label': 'col1',
        },
      },
    },
    {
      column: 'col2',
      id: 'col2',
      spec: {
        valueType: 'String',
        name: 'col2',
        annotations: {
          'pl7.app/label': 'col2',
        },
      },
    },
  ],

  storageFormat: 'Binary',

  partitionKeyLength: 2,
};

tplTest.for([
  { partitionKeyLength: 0, storageFormat: 'Binary' },
  { partitionKeyLength: 1, storageFormat: 'Binary' },
  { partitionKeyLength: 2, storageFormat: 'Binary' },
  { partitionKeyLength: 0, storageFormat: 'Json' },
  { partitionKeyLength: 1, storageFormat: 'Json' },
  { partitionKeyLength: 2, storageFormat: 'Json' },
])(
  'should export p-frame to csv file for partitionKeyLength = $partitionKeyLength ( $storageFormat )',
  // This timeout has additional 10 seconds due to very slow performance of Platforma on large transactions,
  // where thousands of fields and resources are created.
  // The test itself is not large, but first test in a batch also loads 'pframes' binary from network.
  // Also, because of tests execution nature in CI (when we several parallel test threads each creating large resource tree)
  // it shares Platforma Backend performance with other massive parallel tests, making overall test time large even when actual
  // execution takes 1-2 seconds at most.
  { timeout: 30000 },
  async ({ partitionKeyLength, storageFormat }, { helper, expect, driverKit }) => {
    const spec = baseSpec;
    spec.partitionKeyLength = partitionKeyLength;
    spec.storageFormat = storageFormat;

    const result = await helper.renderTemplate(
      false,
      'pframes.test.xsv.export-pf',
      ['csvFile'],
      (tx) => ({
        csv: tx.createValue(Pl.JsonObject, JSON.stringify(csvData)),
        spec: tx.createValue(Pl.JsonObject, JSON.stringify(spec)),
      }),
    );

    const csv = await awaitStableState(
      result.computeOutput('csvFile', (f, ctx) => {
        if (!f) {
          return undefined;
        }
        const h = driverKit.blobDriver.getOnDemandBlob(f.persist(), ctx);

        return h.handle;
      }), 10000,
    );

    const csvContent = (await driverKit.blobDriver.getContent(csv!)).toString();

    // @TODO remove \" replacement after pfconv update
    const actual = csvContent.replaceAll('"', '').replaceAll('\n', '').split('').sort();
    const expected = csvData.replaceAll('\n', '').split('').sort();

    // console.log(actual);
    // console.log(expected);

    // console.log(csvContent);
    // console.log(csvData);

    expect(actual).toEqual(expected);
  },
);

tplTest.for([
  { partitionKeyLength: 1, storageFormat: 'Binary' },
  { partitionKeyLength: 2, storageFormat: 'Binary' },
  { partitionKeyLength: 1, storageFormat: 'Json' },
  { partitionKeyLength: 2, storageFormat: 'Json' },
])(
  'should export filtered p-frame to csv file for partitionKeyLength = $partitionKeyLength ( $storageFormat )',
  // This timeout has additional 10 seconds due to very slow performance of Platforma on large transactions,
  // where thousands of fields and resources are created.
  // The test itself is not large, but first test in a batch also loads 'pframes' binary from network.
  // Also, because of tests execution nature in CI (when we several parallel test threads each creating large resource tree)
  // it shares Platforma Backend performance with other massive parallel tests, making overall test time large even when actual
  // execution takes 1-2 seconds at most.
  { timeout: 30000 },
  async ({ partitionKeyLength, storageFormat }, { helper, expect, driverKit }) => {
    const spec = baseSpec;
    spec.partitionKeyLength = partitionKeyLength;
    spec.storageFormat = storageFormat;

    const result = await helper.renderTemplate(
      false,
      'pframes.test.xsv.export-pf',
      ['csvFile'],
      (tx) => ({
        csv: tx.createValue(Pl.JsonObject, JSON.stringify(csvData)),
        spec: tx.createValue(Pl.JsonObject, JSON.stringify(spec)),
        ops: tx.createValue(Pl.JsonObject, JSON.stringify({ partitions: { 0: ['A2'] } })),
      }),
    );

    const csv = await awaitStableState(
      result.computeOutput('csvFile', (f, ctx) => {
        if (!f) {
          return undefined;
        }
        const h = driverKit.blobDriver.getOnDemandBlob(f.persist(), ctx);

        return h.handle;
      }), 10000,
    );

    const csvContent = (await driverKit.blobDriver.getContent(csv!)).toString();

    // @TODO remove \" replacement after pfconv update
    const actual = csvContent.replaceAll('"', '').replaceAll('\n', '').split('').sort();
    const expected = csvData.split('\n').filter((l, i) => i == 0 || l.includes('A2')).join('').split('').sort();

    expect(actual).toEqual(expected);
  },
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
    storageFormat: 'Binary',
  },
  {
    superPartitionKeyLength: 0,
    partitionKeyLength: 1,
    storageFormat: 'Binary',
  },
  {
    superPartitionKeyLength: 0,
    partitionKeyLength: 2,
    storageFormat: 'Binary',
  },
  {
    superPartitionKeyLength: 1,
    partitionKeyLength: 0,
    storageFormat: 'Binary',
  },
  {
    superPartitionKeyLength: 1,
    partitionKeyLength: 1,
    storageFormat: 'Binary',
  },
  {
    superPartitionKeyLength: 1,
    partitionKeyLength: 2,
    storageFormat: 'Binary',
  },
  {
    superPartitionKeyLength: 2,
    partitionKeyLength: 0,
    storageFormat: 'Binary',
  },
  {
    superPartitionKeyLength: 2,
    partitionKeyLength: 1,
    storageFormat: 'Binary',
  },
  {
    superPartitionKeyLength: 2,
    partitionKeyLength: 2,
    storageFormat: 'Binary',
  },

  { superPartitionKeyLength: 0, partitionKeyLength: 0, storageFormat: 'Json' },
  { superPartitionKeyLength: 0, partitionKeyLength: 1, storageFormat: 'Json' },
  { superPartitionKeyLength: 1, partitionKeyLength: 0, storageFormat: 'Json' },
  { superPartitionKeyLength: 1, partitionKeyLength: 1, storageFormat: 'Json' },
])(
  'should export super-partitioned p-frame to csv file - superPartitionKeyLength: $superPartitionKeyLength, partitionKeyLength: $partitionKeyLength',
  { timeout: 30000 },
  async (
    { superPartitionKeyLength, partitionKeyLength, storageFormat },
    { helper, expect, driverKit },
  ) => {
    const supKeys = superPartitionKeys(superPartitionKeyLength).sort();
    const spec = baseSpec;
    spec.partitionKeyLength = partitionKeyLength;
    spec.storageFormat = storageFormat;

    const result = await helper.renderTemplate(
      false,
      'pframes.test.xsv.export-super-pf',
      ['csvFile'],
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
          spec: tx.createValue(Pl.JsonObject, JSON.stringify(spec)),
        };
      },
    );

    const csv = await awaitStableState(
      result.computeOutput('csvFile', (f, ctx) => {
        if (!f) {
          return undefined;
        }
        const h = driverKit.blobDriver.getOnDemandBlob(f.persist(), ctx);

        return h.handle;
      }), 10000,
    );

    const csvContent = (await driverKit.blobDriver.getContent(csv!)).toString();

    // @TODO remove \" replacement after pfconv update
    const actual = csvContent.replaceAll('"', '').replaceAll('\n', '').split('').sort();
    const expected = csvData.replaceAll('\n', '').split('').sort();

    // console.log(actual);
    // console.log(expected);

    // console.log(csvContent);
    // console.log(csvData);

    if (superPartitionKeyLength === 0) expect(actual).toEqual(expected);
  },
);
