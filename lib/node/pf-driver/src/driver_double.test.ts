import type {
  CalculateTableDataResponse,
  PFrameDriver,
  PObjectId,
} from '@platforma-sdk/model';
import { expect, test } from 'vitest';
import { createPFrameDriverDouble } from './driver_double';

test('inline column support', async () => {
    // Model context

    await using driver = await createPFrameDriverDouble({});
    using pFrame = driver.createPFrame([
        {
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
        }
    ]);

    // UI context

    const uiDriver: PFrameDriver = driver;
    const pFrameHandle = pFrame.key;

    const data = await uiDriver.calculateTableData(pFrameHandle, {
        src: {
            type: 'full',
            entries: [
                {
                    type: 'column',
                    column: 'column1' as PObjectId,
                },
            ],
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
})
