import {
  pTableValue,
  type CalculateTableDataResponse,
  type PFrameDriver,
  type PObjectId,
} from '@platforma-sdk/model';
import {
  readJson,
  PFrameInternal,
} from '@milaboratories/pl-model-middle-layer';
import { test } from 'vitest';
import { join } from 'node:path';
import {
  createPFrameDriverDouble,
  makeFolderPath,
} from './driver_double';

test('inline column support', async ({ expect }) => {
  // Model context

  await using driver = await createPFrameDriverDouble({});
  using pFrame = driver.createPFrame([{
    id: 'column1' as PObjectId,
    spec: {
      kind: 'PColumn',
      axesSpec: [{
        name: 'axis1',
        type: 'String',
      }],
      name: 'column1',
      valueType: 'Int',
    },
    data: [
      {
        key: ['axis1'],
        val: 1,
      },
    ],
  }]);

  // UI context

  const uiDriver: PFrameDriver = driver;
  const pFrameHandle = pFrame.key;

  const data = await uiDriver.calculateTableData(pFrameHandle, {
    src: {
      type: 'column',
      column: 'column1' as PObjectId,
    },
    filters: [],
    sorting: [],
  });

  expect(data).toEqual([
    {
      spec: {
        type: 'axis',
        id: {
          name: 'axis1',
          type: 'String',
        },
        spec: {
          name: 'axis1',
          type: 'String',
        },
      },
      data: {
        type: 'String',
        data: ['axis1'],
        isNA: new Uint8Array(),
        absent: new Uint8Array(),
      },
    },
    {
      spec: {
        type: 'column',
        id: 'column1' as PObjectId,
        spec: {
          kind: 'PColumn',
          axesSpec: [{
            name: 'axis1',
            type: 'String',
          }],
          name: 'column1',
          valueType: 'Int',
        },
      },
      data: {
        type: 'Int',
        data: new Int32Array([1]),
        isNA: new Uint8Array(),
        absent: new Uint8Array(),
      },
    },
  ] satisfies CalculateTableDataResponse);
});

test.for([
  { testCase: '01_json' },
  { testCase: '02_binary' },
  { testCase: '03_parquet' },
])(`stored column support - $testCase`, async ({ testCase }, { expect }) => {
  const dataFolder = makeFolderPath(join(__dirname, '..', 'assets', testCase));

  // Model context

  await using driver = await createPFrameDriverDouble({ dataFolder });
  const pFrame = driver.createPFrame([{
    id: 'column' as PObjectId,
    spec: await readJson(join(dataFolder, `column${PFrameInternal.SpecExtension}`)),
    data: await readJson(join(dataFolder, `column${PFrameInternal.DataInfoExtension}`)),
  }]);

  // UI context

  const uiDriver: PFrameDriver = driver;
  const pFrameHandle = pFrame.key;

  const data = await uiDriver.calculateTableData(pFrameHandle, {
    src: {
      type: 'column',
      column: 'column' as PObjectId,
    },
    filters: [],
    sorting: [],
  });
  const result = {
    spec: data.map((d) => d.spec),
    data: data.map((d) => d.data)
      .map((d) => [...d.data.keys()].map((i) => pTableValue(d, i, {
        absent: '|~|',
        na: null,
      }))),
  };
  const expected = await readJson(join(dataFolder, 'response.json'));
  expect(result).toEqual(expected);
});
