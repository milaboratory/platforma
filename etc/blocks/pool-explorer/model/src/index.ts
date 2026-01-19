import { BlockModelV3, type InferHrefType, type InferOutputsType } from '@platforma-sdk/model';

export type BlockData = {
  titleArgs: string;
};

export type BlockArgs = BlockData;

export const platforma = BlockModelV3.create('Heavy')

  .withData<BlockData>(() => ({ titleArgs: 'The title' }))

  .args<BlockArgs>((data) => {
    return { titleArgs: data.titleArgs };
  })

  .output('allSpecs', (ctx) => ctx.resultPool.getSpecs())

  .sections((_ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .title((_ctx) => 'Pool explorer')

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
