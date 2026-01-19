import type {
  InferHrefType,
  InferOutputsType,
} from '@platforma-sdk/model';
import {
  Annotation,
  BlockModelV3,
  DataModel,
  PlRef,
  readAnnotation,
} from '@platforma-sdk/model';
import { z } from 'zod';

export const BlockData = z.object({
  sources: z.array(PlRef).optional(),
});

export type BlockData = z.infer<typeof BlockData>;

// Simple data model with just initial data (no migrations)
const dataModel = DataModel.create<BlockData>(() => ({
  sources: undefined,
}));

export const platforma = BlockModelV3.create({ dataModel, renderingMode: 'Heavy' })

  .args<BlockData>((data) => {
    if (data.sources === undefined || data.sources.length === 0) {
      throw new Error('Sources are required');
    }
    return { sources: data.sources };
  })

  .preRunArgs((data) => {
    // Return sources for prerun even if empty (for testing purposes)
    return { sources: data.sources ?? [] };
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

  .output('preRunArgsJson', (ctx) => ctx.prerun?.resolve('preRunArgsJson')?.getDataAsJson<Record<string, unknown>>())

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
