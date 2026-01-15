import type {
  InferHrefType,
  InferOutputsType,
} from '@platforma-sdk/model';
import {
  BlockModelV3,
} from '@platforma-sdk/model';
import { z } from 'zod';

// State version 1: just numbers
type BlockStateV1 = {
  numbers: number[];
};

// State version 2: added labels
type BlockStateV2 = {
  numbers: number[];
  labels: string[];
};

// State version 3 (current): added description
export const $BlockState = z.object({
  numbers: z.array(z.coerce.number()),
  labels: z.array(z.string()),
  description: z.string(),
});

export type BlockState = z.infer<typeof $BlockState>;

export const platforma = BlockModelV3
  .create('Heavy')

  .withState<BlockState>({ numbers: [], labels: [], description: '' })

  // Migration v1 → v2: sort numbers and add labels
  .migration<BlockStateV1>((state) => {
    return { numbers: state.numbers.toSorted(), labels: ['migrated-from-v1'] };
  })

  // Migration v2 → v3: add description
  .migration<BlockStateV2>((state) => {
    return { ...state, description: `Migrated: ${state.labels.join(', ')}` };
  })

  .args((data) => {
    if (data.numbers.length === 0) {
      throw new Error('Numbers are required!');
    }
    return { numbers: data.numbers.toSorted() };
  })

  .preRunArgs((state) => {
    return { evenNumbers: state.numbers.toSorted().filter((n) => n % 2 === 0) };
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
