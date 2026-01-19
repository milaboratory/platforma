import type {
  InferHrefType,
  InferOutputsType } from '@platforma-sdk/model';
import {
  Annotation,
  BlockModel,
  PlRef,
  readAnnotation,
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
        return readAnnotation(spec.obj, Annotation.Label) == 'Numbers';
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
        return readAnnotation(spec.obj, Annotation.Label) == 'Numbers';
      })
      .map((opt, i) => ({
        label: `numbers_${i}`,
        value: { ...opt.ref, requireEnrichment: true },
      })),
  )

  .output('sum', (ctx) => ctx.outputs?.resolve('sum')?.getDataAsJson<number>())

  .output('uiState', (ctx) => ctx.uiState)

  .argsValid((ctx) => ctx.args.sources !== undefined && ctx.args.sources.length > 0)

  .enriches((args) =>
    (args.sources !== undefined && args.sources.length > 0)
      ? [args.sources[0]]
      : [],
  )

  .sections((_ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .done(2); // ui api version 2

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
