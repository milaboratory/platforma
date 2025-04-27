import type {
  InferHrefType,
  InferOutputsType } from '@platforma-sdk/model';
import {
  Args,
  BlockModel,
  getJsonField,
  isEmpty,
  not,
  PlRef,
} from '@platforma-sdk/model';
import { z } from 'zod';

export const BlockArgs = z.object({
  sources: z.array(PlRef).optional(),
});

export type BlockArgs = z.infer<typeof BlockArgs>;

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({
    sources: undefined,
  })

  .output('opts', (ctx) =>
    ctx.resultPool
      .getSpecs()
      .entries.filter((spec) => {
        if (spec.obj.annotations === undefined) return false;
        return spec.obj.annotations['pl7.app/label'] == 'Numbers';
      })
      .map((opt, i) => ({
        label: `numbers_${i}`,
        value: opt.ref,
      })),
  )

  .output('optsWithEnrichments', (ctx) =>
    ctx.resultPool
      .getSpecs()
      .entries.filter((spec) => {
        if (spec.obj.annotations === undefined) return false;
        return spec.obj.annotations['pl7.app/label'] == 'Numbers';
      })
      .map((opt, i) => ({
        label: `numbers_${i}`,
        value: { ...opt.ref, requireEnrichment: true },
      })),
  )

  .output('sum', (ctx) => ctx.outputs?.resolve('sum')?.getDataAsJson<number>())

  .argsValid((ctx) => ctx.args.sources !== undefined && ctx.args.sources.length > 0)

  .enriches((args) =>
    (args.sources !== undefined && args.sources.length > 0)
      ? [args.sources[0]]
      : [],
  )

  .sections((_ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
