import { BlockModelV3, DataModel, type InferHrefType, type InferOutputsType } from '@platforma-sdk/model';

export type BlockData = {
  titleArgs: string;
};

export type BlockArgs = BlockData;

const dataModel = DataModel.create<BlockData>(() => ({ titleArgs: 'The title' }));

export const platforma = BlockModelV3.create({ dataModel, renderingMode: 'Heavy' })

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
