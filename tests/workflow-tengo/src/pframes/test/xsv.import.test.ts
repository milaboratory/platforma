/* eslint-disable @typescript-eslint/no-explicit-any */
import { field, Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';
import { Templates } from '../../../dist';
import { deepClone, getTestTimeout } from '@milaboratories/helpers';

const TIMEOUT = getTestTimeout(60_000);

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

  for (let iRow = 0; iRow < lines.length - 1; ++iRow) {
    const line = lines[iRow + 1].split(',');

    for (let iCol = 0; iCol < header.length; ++iCol) {
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
      },
    },
    {
      column: 'ax2',
      spec: {
        name: 'ax2',
        type: 'String',
      },
    },
    {
      column: 'ax3',
      spec: {
        name: 'ax3',
        type: 'String',
      },
    },
  ],
  columns: [
    {
      column: 'col1',
      id: 'col1',
      spec: {
        valueType: 'String',
      },
    },
    {
      column: 'col2',
      id: 'col2',
      spec: {
        valueType: 'String',
      },
    },
  ],

  storageFormat: 'Binary',

  partitionKeyLength: 2,
};

// partition keys values as Json encoded strings
const expectedPartitionKeys = function (spec: typeof baseSpec) {
  const r: string[] = [];
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
function partitionKeyJson(str: string): string {
  // double conversion for assertion
  return JSON.stringify(JSON.parse(str.replace('.index', '').replace('.values', '')));
}

const keysOf = (fields?: string[]) => [...new Set((fields ?? []).map(partitionKeyJson))].sort();

const expectedColMeta = (superLen: number, partLen: number, storageFormat: string) => {
  if (superLen > 0 && partLen > 0) {
    return {
      type: `PColumnData/Partitioned/${storageFormat}Partitioned`,
      data: { superPartitionKeyLength: superLen, partitionKeyLength: partLen },
    };
  }
  return {
    type: `PColumnData/${storageFormat}Partitioned`,
    data: { partitionKeyLength: Math.max(superLen, partLen) },
  };
};

const getColMeta = async (result: any, colName: string, timeout = TIMEOUT) =>
  await awaitStableState(
    result.computeOutput('pf', (pf: any, ctx: any) => {
      const r = pf?.traverse(colName + '.data');
      if (!r || !r.getIsReadyOrError()) {
        ctx.markUnstable('not_ready');
        return undefined;
      }
      return {
        type: r.resourceType.name,
        data: r.getDataAsJson(),
        fields: r.listInputFields(),
      };
    }),
    timeout,
  );

tplTest.concurrent.for([
  { partitionKeyLength: 0, storageFormat: 'Binary' },
  { partitionKeyLength: 1, storageFormat: 'Binary' },
  { partitionKeyLength: 2, storageFormat: 'Binary' },
  { partitionKeyLength: 0, storageFormat: 'Json' },
  { partitionKeyLength: 1, storageFormat: 'Json' },
  { partitionKeyLength: 2, storageFormat: 'Json' },
])(
  'should read p-frame from csv file for partitionKeyLength = $partitionKeyLength ( $storageFormat )',
  // This timeout has additional 10 seconds due to very slow performance of Platforma on large transactions,
  // where thousands of fields and resources are created.
  // The test itself is not large, but first test in a batch also loads 'pframes' binary from network.
  // Also, because of tests execution nature in CI (when we several parallel test threads each creating large resource tree)
  // it shares Platforma Backend performance with other massive parallel tests, making overall test time large even when actual
  // execution takes 1-2 seconds at most.
  { timeout: TIMEOUT },
  async ({ partitionKeyLength, storageFormat }, { helper, expect, driverKit }) => {
    const spec = deepClone(baseSpec);
    spec.partitionKeyLength = partitionKeyLength;
    spec.storageFormat = storageFormat;
    const expectedPKeys = expectedPartitionKeys(spec).sort();

    const result = await helper.renderTemplate(
      false,
      'pframes.test.xsv.import-csv',
      ['pf'],
      (tx) => ({
        csv: tx.createValue(Pl.JsonObject, JSON.stringify(csvData)),
        spec: tx.createValue(Pl.JsonObject, JSON.stringify(spec)),
      }),
    );

    const cols = (
      await awaitStableState(result.computeOutput('pf', (pf) => pf?.listInputFields()), TIMEOUT)
    )?.sort();

    const expected = ['col1.data', 'col1.spec', 'col2.data', 'col2.spec'].sort();
    expect(cols).toStrictEqual(expected);

    await Promise.all(
      ['col1', 'col2'].map(async (colName) => {
        const col = await getColMeta(result, colName);

        expect(col.type).toEqual(`PColumnData/${spec.storageFormat}Partitioned`);
        expect(col.data).toEqual({ partitionKeyLength: spec.partitionKeyLength });

        expect(keysOf(col.fields)).toEqual(expectedPKeys);

        if (storageFormat == 'Json' && partitionKeyLength == 0) {
          const dataOpt = await awaitStableState(
            result.computeOutput('pf', (pf, ctx) => {
              const r = pf?.traverse(colName + '.data', JSON.stringify([]));
              if (!r) {
                ctx.markUnstable('no_partition');
                return undefined;
              }
              return driverKit.blobDriver.getOnDemandBlob(r.persist(), ctx).handle;
            }),
            TIMEOUT,
          );

          const data = JSON.parse(
            Buffer.from(await driverKit.blobDriver.getContent(dataOpt!)).toString('utf-8'),
          );

          const values = Object.keys(data)
            .map((key) => data[key])
            .sort();

          const expectedPValues = csvDataMap.get(colName)!.sort();
          expect(values).toEqual(expectedPValues);
        } else {
          // @TODO test
        }
      }),
    );
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
  'should read super-partitioned p-frame from csv files map- superPartitionKeyLength: $superPartitionKeyLength, partitionKeyLength: $partitionKeyLength',
  { timeout: TIMEOUT },
  async ({ superPartitionKeyLength, partitionKeyLength, storageFormat }, { helper, expect }) => {
    const supKeys = superPartitionKeys(superPartitionKeyLength).sort();
    const spec = deepClone(baseSpec);
    spec.partitionKeyLength = partitionKeyLength;
    spec.storageFormat = storageFormat;
    // inner keys
    const expectedPKeys = expectedPartitionKeys(spec).sort();

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
          spec: tx.createValue(Pl.JsonObject, JSON.stringify(spec)),
        };
      },
    );

    await Promise.all(
      ['col1', 'col2'].map(async (colName) => {
        const col = await awaitStableState(
          result.computeOutput('pf', (pf, ctx) => {
            const r = pf?.traverse(colName + '.data');
            if (!r || !r.getIsReadyOrError()) {
              ctx.markUnstable('not_ready');
              return undefined;
            }
            return {
              type: r.resourceType.name,
              data: r.getDataAsJson(),
              fields: r.listInputFields(),
            };
          }),
          TIMEOUT,
        );

        const exp = expectedColMeta(superPartitionKeyLength, partitionKeyLength, spec.storageFormat);
        expect(col.type).toEqual(exp.type);
        expect(col.data).toEqual(exp.data);

        const keys = keysOf(col.fields);
        if (superPartitionKeyLength > 0 && partitionKeyLength > 0) {
          expect(keys).toEqual(supKeys);

          await Promise.all(
            supKeys.map(async (sk) => {
              const inner = await awaitStableState(
                result.computeOutput('pf', (pf, ctx) => {
                  const r = pf?.traverse(colName + '.data', sk);
                  if (!r || !r.getIsReadyOrError()) {
                    ctx.markUnstable('not_ready');
                    return undefined;
                  }
                  return {
                    type: r.resourceType.name,
                    data: r.getDataAsJson(),
                    fields: r.listInputFields(),
                  };
                }),
                TIMEOUT,
              );

              expect(inner.type).toEqual(`PColumnData/${spec.storageFormat}Partitioned`);
              expect(inner.data).toEqual({ partitionKeyLength: spec.partitionKeyLength });
              expect(keysOf(inner.fields)).toEqual(expectedPKeys);

              if (storageFormat == 'Json') {
                // @TODO test data
              }
            }),
          );
        } else if (superPartitionKeyLength == 0) {
          expect(keys).toEqual(expectedPKeys);
        } else if (partitionKeyLength == 0) {
          expect(keys).toEqual(supKeys);
        }
      }),
    );
  },
);

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
  '[in workflow] should read super-partitioned p-frame from csv files map- superPartitionKeyLength: $superPartitionKeyLength, partitionKeyLength: $partitionKeyLength',
  { timeout: TIMEOUT },
  async ({ superPartitionKeyLength, partitionKeyLength, storageFormat }, { helper, expect }) => {
    const supKeys = superPartitionKeys(superPartitionKeyLength).sort();
    const spec = deepClone(baseSpec);
    spec.partitionKeyLength = partitionKeyLength;
    spec.storageFormat = storageFormat;
    const expectedPKeys = expectedPartitionKeys(spec).sort();

    const csvMap = Object.fromEntries(supKeys.map((supKey) => [supKey, csvData]));

    const result = await helper.renderWorkflow(
      Templates['pframes.test.xsv.import-csv-map-wf'],
      false,
      {
        csvMap: csvMap,
        keyLength: superPartitionKeyLength,
        spec,
      },
      { exportProcessor: Templates['pframes.export-pframe'] },
    );

    await Promise.all(
      ['col1', 'col2'].map(async (colName) => {
        const col = await awaitStableState(
          result.export(`${colName}.data`, (r) => {
            if (!r || !r.getIsReadyOrError()) return undefined;
            return {
              type: r.resourceType.name,
              data: r.getDataAsJson(),
              fields: r.listInputFields(),
            };
          }),
          TIMEOUT,
        );

        const exp = expectedColMeta(superPartitionKeyLength, partitionKeyLength, spec.storageFormat);
        expect(col.type).toEqual(exp.type);
        expect(col.data).toEqual(exp.data);

        const keys = keysOf(col.fields);
        if (superPartitionKeyLength > 0 && partitionKeyLength > 0) {
          expect(keys).toEqual(supKeys);

          await Promise.all(
            supKeys.map(async (sk) => {
              const inner = await awaitStableState(
                result.export(`${colName}.data`, (pc) => {
                  const r = pc?.traverse(sk);
                  if (!r || !r.getIsReadyOrError()) return undefined;
                  return {
                    type: r.resourceType.name,
                    data: r.getDataAsJson(),
                    fields: r.listInputFields(),
                  };
                }),
                TIMEOUT,
              );

              expect(inner.type).toEqual(`PColumnData/${spec.storageFormat}Partitioned`);
              expect(inner.data).toEqual({ partitionKeyLength: spec.partitionKeyLength });
              expect(keysOf(inner.fields)).toEqual(expectedPKeys);

              if (storageFormat == 'Json') {
                // @TODO test data
              }
            }),
          );
        } else if (superPartitionKeyLength == 0) {
          expect(keys).toEqual(expectedPKeys);
        } else if (partitionKeyLength == 0) {
          expect(keys).toEqual(supKeys);
        }
      }),
    );
  },
);
