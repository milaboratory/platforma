import type {
  InferHrefType,
  InferOutputsType,
} from '@platforma-sdk/model';
import {
  BlockModelV3,
  DataModel,
} from '@platforma-sdk/model';
import { z } from 'zod';

// Data version 1: just numbers
type BlockDataV1 = {
  numbers: number[];
};

// Data version 2: added labels
type BlockDataV2 = {
  numbers: number[];
  labels: string[];
};

// Data version 3 (current): added description
export const $BlockData = z.object({
  numbers: z.array(z.coerce.number()),
  labels: z.array(z.string()),
  description: z.string(),
});

export type BlockData = z.infer<typeof $BlockData>;

// TODO: add unique key to be able to drop migrations
// Define data model with migrations from v1 to current
const dataModel = DataModel
  .from<BlockDataV1>()
  // Migration v1 → v2: sort numbers and add labels
  // Throws if numbers contain 666 (for testing migration failure recovery)
  .migrate<BlockDataV2>((data) => { // TODO: migrateTo???
    if (data.numbers.includes(666)) {
      throw new Error('Migration failed: number 666 is forbidden!');
    }
    return { numbers: data.numbers.toSorted(), labels: ['migrated-from-v1'] } satisfies BlockDataV2;
  })
  // Migration v2 → v3: add description
  .migrate<BlockData>((data) => {
    return { ...data, description: `Migrated: ${data.labels.join(', ')}` };
  })
  .create<BlockData>(() => ({ numbers: [], labels: [], description: '' }));

export const platforma = BlockModelV3
  .create({ dataModel, renderingMode: 'Heavy' })

  .args((data) => {
    if (data.numbers.length === 0) {
      throw new Error('Numbers are required!');
    }
    return { numbers: data.numbers.toSorted() };
  })

  .preRunArgs((data) => {
    return { evenNumbers: data.numbers.toSorted().filter((n) => n % 2 === 0) };
  })

  .output('numbers', (ctx) => ctx.outputs?.resolve('numbers')?.getDataAsJson<number[]>())

  .output('activeArgs', (ctx) => ctx.activeArgs)

  .output('numbersCount', (ctx) => ctx.prerun?.resolve('numbersCount')?.getDataAsJson<number>() ?? 0)

  .output('preRunArgsJson', (ctx) => ctx.prerun?.resolve('preRunArgsJson')?.getDataAsJson<Record<string, unknown>>())

  .output('errorIfNumberIs999', (ctx) => {
    const numbers = ctx.args?.numbers;

    if (numbers?.length === 1 && numbers[0] === 999) {
      return ctx.prerun?.resolve('numbers')?.getFileContentAsJson<number[]>();
    }

    return numbers ?? [];
  })

  .output('ctx', (ctx) => ctx)

  .output('ctx.activeArgs', (ctx) => ctx.activeArgs)

  .output('ctx.args', (ctx) => ctx.args)

  .output('ctx.data', (ctx) => ctx.data)

  .sections((_ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
