import { BlockModel, InferHrefType, InferOutputsType } from '@platforma-sdk/model';
import {z} from 'zod';

export const $BlockArgs = z.object({
  numbers: z.array(z.coerce.number())
});

export type BlockArgs = z.infer<typeof $BlockArgs>;

export const platforma = BlockModel.create<BlockArgs>('Heavy')

  .initialArgs({ numbers: [1, 2, 3] })

  .output('numbers', (ctx) =>
    ctx.outputs?.resolve('numbers')?.getDataAsJson()
  )

  .sections((ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
