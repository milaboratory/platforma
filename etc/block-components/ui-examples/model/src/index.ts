import { BlockModel, InferHrefType, InferOutputsType } from '@platforma-sdk/model';
import {z} from 'zod';

export const $BlockArgs = z.object({
  numbers: z.array(z.coerce.number())
});

export type BlockArgs = z.infer<typeof $BlockArgs>;

export const platforma = BlockModel.create<BlockArgs>('Heavy')

  .initialArgs({ numbers: [] })

  .output('numbers', (ctx) =>
    ctx.prerun?.resolve({ field: 'numbers', assertFieldType: 'Input' })?.getDataAsJson<number[]>()
  )

  .sections((ctx) => {
    return [
      { type: 'link', href: '/', label: 'PlLogView' }, 
      { type: 'link', href: '/slide-modal', label: 'PlSlideModal' }
    ];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
