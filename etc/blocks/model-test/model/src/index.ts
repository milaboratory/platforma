import { BlockModel, type InferHrefType, type InferOutputsType } from '@platforma-sdk/model';

export type BlockArgs = {
  titleArg: string;
  subtitleArg: string;
  badgeArg: string;
  tagArgs: string[];
};

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({
    titleArg: 'The title',
    subtitleArg: 'The subtitle',
    badgeArg: 'The badge',
    tagArgs: [],
  })

  .sections((ctx) => {
    return [{ type: 'link', href: '/', label: 'Main', badge: ctx.args.badgeArg }];
  })

  .title((ctx) => ctx.args.titleArg + ' <- the title')

  .subtitle((ctx) => ctx.args.subtitleArg + ' <- the subtitle')

  .tags((ctx) => ctx.args.tagArgs)

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
