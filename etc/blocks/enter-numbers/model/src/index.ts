import { BlockModel, InferHrefType, InferOutputsType } from '@platforma-sdk/model';

export type BlockArgs = { numbers: number[] };

export const platforma = BlockModel.create<BlockArgs>('Heavy')

  .initialArgs({ numbers: [] })

  .output('numbers', (ctx) =>
    ctx.prerun?.resolve({ field: 'numbers', assertFieldType: 'Input' })?.getDataAsJson<number[]>()
  )

  .sections((ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
