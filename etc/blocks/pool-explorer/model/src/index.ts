import { BlockModelV3, type InferHrefType, type InferOutputsType } from '@platforma-sdk/model';

export type BlockState = {
  titleArgs: string;
};

export type BlockArgs = BlockState;

export const platforma = BlockModelV3.create('Heavy')

  .withState<BlockState>({ titleArgs: 'The title' })

  .args<BlockArgs>((state) => {
    return { titleArgs: state.titleArgs };
  })

  .output('allSpecs', (ctx) => ctx.resultPool.getSpecs())

  .sections((_ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .title((_ctx) => 'Pool explorer')

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
