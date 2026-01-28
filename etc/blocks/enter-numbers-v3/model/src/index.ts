import type {
  InferHrefType,
  InferOutputsType,
} from '@platforma-sdk/model';
import {
  BlockModelV3,
  DataModelBuilder,
  defineDataVersions,
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

const Version = defineDataVersions({
  Initial: 'v1',
  AddedLabels: 'v2',
  AddedDescription: 'v3',
});

type VersionedData = {
  [Version.Initial]: BlockDataV1;
  [Version.AddedLabels]: BlockDataV2;
  [Version.AddedDescription]: BlockData;
};

// Define data model with migrations from v1 to current
const dataModel = new DataModelBuilder<VersionedData>()
  .from(Version.Initial)
  // Migration v1 → v2: sort numbers and add labels
  // Throws if numbers contain 666 (for testing migration failure recovery)
  .migrate(Version.AddedLabels, (data) => {
    if (data.numbers.includes(666)) {
      throw new Error('Migration failed: number 666 is forbidden!');
    }
    return { numbers: data.numbers.toSorted(), labels: ['migrated-from-v1'] } satisfies BlockDataV2;
  })
  // Migration v2 → v3: add description
  .migrate(Version.AddedDescription, (data) => {
    return { ...data, description: `Migrated: ${data.labels.join(', ')}` };
  })
  .init(() => ({ numbers: [], labels: [], description: '' }));

export const platforma = BlockModelV3
  .create({ dataModel, renderingMode: 'Heavy' })

  .args((data) => {
    if (data.numbers.length === 0) {
      throw new Error('Numbers are required!');
    }
    return { numbers: data.numbers.toSorted() };
  })

  .prerunArgs((data) => {
    return { evenNumbers: data.numbers.toSorted().filter((n) => n % 2 === 0) };
  })

  .output('numbers', (ctx) => ctx.outputs?.resolve('numbers')?.getDataAsJson<number[]>())

  .output('activeArgs', (ctx) => ctx.activeArgs)

  .output('numbersCount', (ctx) => ctx.prerun?.resolve('numbersCount')?.getDataAsJson<number>() ?? 0)

  .output('prerunArgsJson', (ctx) => ctx.prerun?.resolve('prerunArgsJson')?.getDataAsJson<Record<string, unknown>>())

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
