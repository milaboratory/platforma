import { deepClone } from '@milaboratories/helpers';
import { Annotation, field, Pl } from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';
import { vi } from 'vitest';
import dedent from 'dedent';
import { Timeout, getFileContent } from '../../pt/helpers';

vi.setConfig({ testTimeout: Timeout });

// dummy csv data
const csvData = dedent`
  ax1,ax2,ax3,col1,col2
  A1,B1,C1,X1,Y1
  A2,B2,C2,X2,Y2
  A3,B2,C3,X3,Y3
`;

// pfconv spec
const baseSpec = {
  axes: [
    {
      column: 'ax1',
      spec: {
        name: 'ax1',
        type: 'String',
        annotations: {
          [Annotation.Label]: 'ax1',
        } satisfies Annotation,
      },
    },
    {
      column: 'ax2',
      spec: {
        name: 'ax2',
        type: 'String',
        annotations: {
          [Annotation.Label]: 'ax2',
        } satisfies Annotation,
      },
    },
    {
      column: 'ax3',
      spec: {
        name: 'ax3',
        type: 'String',
        annotations: {
          [Annotation.Label]: 'ax3',
        } satisfies Annotation,
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
          [Annotation.Label]: 'col1',
        } satisfies Annotation,
      },
    },
    {
      column: 'col2',
      id: 'col2',
      spec: {
        valueType: 'String',
        name: 'col2',
        annotations: {
          [Annotation.Label]: 'col2',
        } satisfies Annotation,
      },
    },
  ],

  storageFormat: 'Binary',

  partitionKeyLength: 2,
};

tplTest.concurrent.for([
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
  async ({ partitionKeyLength, storageFormat }, { helper, expect, driverKit }) => {
    const spec = deepClone(baseSpec);
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

    const csvContent = await getFileContent(result, 'csvFile', driverKit);
    expect(csvContent.trim()).toStrictEqual(csvData.trim());
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

tplTest.concurrent.for([
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
  async (
    { superPartitionKeyLength, partitionKeyLength, storageFormat },
    { helper, expect, driverKit },
  ) => {
    const supKeys = superPartitionKeys(superPartitionKeyLength).sort();
    const spec = deepClone(baseSpec);
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

    const csvContent = await getFileContent(result, 'csvFile', driverKit);
    if (superPartitionKeyLength === 0) expect(csvContent.trim()).toStrictEqual(csvData.trim());
  },
);
