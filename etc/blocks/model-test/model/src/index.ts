import { BlockModel, InferHrefType, InferOutputsType } from '@platforma-sdk/model';

export type BlockArgs = {
  titleArg: string;
};

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({ titleArg: 'The title' })

  .sections((ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .title((ctx) => ctx.args.titleArg + ' <- the title')

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
