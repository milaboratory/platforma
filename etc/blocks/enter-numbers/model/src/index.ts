import {
  Args,
  BlockModel,
  getJsonField,
  InferHrefType,
  InferOutputsType,
  isEmpty,
  not
} from '@platforma-sdk/model';
import { z } from 'zod';

export const $BlockArgs = z.object({
  numbers: z.array(z.coerce.number())
});

export type BlockArgs = z.infer<typeof $BlockArgs>;

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({ numbers: [] })

  .output('numbers', (ctx) => ctx.outputs?.resolve('numbers')?.getDataAsJson<number[]>())

  .output('activeArgs', (ctx) => ctx.activeArgs)

  .argsValid((ctx) => ctx.args.numbers.length > 0)

  .sections((ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
