import { BlockModel, InferHrefType, InferOutputsType } from '@platforma-sdk/model';

export type BlockArgs = {
  titleArg: string;
};

export const platforma = BlockModel.create<BlockArgs>('Heavy')

  .initialArgs({ titleArg: 'The title' })

  .sections((ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
