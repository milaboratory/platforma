import {
  AnyRef,
  field,
  PlTransaction,
  ResourceRef,
  ResourceType,
  Pl
} from '@milaboratory/pl-client-v2';
import { randomUUID } from 'node:crypto';
import { createRenderTemplate } from './render_template';

export const BContextEnd: ResourceType = { name: 'BContextEnd', version: '1' };
export const BContext: ResourceType = { name: 'BContext', version: '1' };
export const BContextId = 'id';
export const BContextParent = 'parent';
export const BContextMultiParentPrefix = 'parent/';

// TODO: add implementation for dual context heavy block.
// export type BlockType =
//   | 'LightBlock'
//   | 'HeavyBlock'
//   | 'DualContextHeavyBlock';
// moved to project model ==>>>

export type HeavyBlockInputs = {
  args: AnyRef;
  blockId: AnyRef;
  isProduction: AnyRef;
  context: AnyRef;
};

export type HeavyBlockOutputs = {
  context: AnyRef;
  result: AnyRef;
};

export const HeavyBlockOutputNames: (keyof HeavyBlockOutputs)[] = ['context', 'result'];

export function createRenderHeavyBlock(
  tx: PlTransaction,
  tpl: AnyRef,
  inputs: HeavyBlockInputs
): HeavyBlockOutputs {
  return createRenderTemplate(tx, tpl, true, inputs, HeavyBlockOutputNames);
}

export type LightBlockInputs = {
  args: AnyRef;
  blockId: AnyRef;
  stagingContext: AnyRef;
  productionContext: AnyRef;
};

export type LightBlockOutput = {
  result: AnyRef;
};

export const LightBlockOutputNames: (keyof LightBlockOutput)[] = ['result'];

export function createRenderLightBlock(
  tx: PlTransaction,
  tpl: ResourceRef,
  inputs: LightBlockInputs
): LightBlockOutput {
  return createRenderTemplate(tx, tpl, true, inputs, LightBlockOutputNames);
}

export function createBContextEnd(tx: PlTransaction): ResourceRef {
  const ctx = tx.createEphemeral(BContextEnd);
  tx.lock(ctx);
  return ctx;
}

export function createBContextFromUpstreams(tx: PlTransaction, upstreamCtxs: AnyRef[]): AnyRef {
  if (upstreamCtxs.length === 0) return createBContextEnd(tx);

  if (upstreamCtxs.length === 1) return upstreamCtxs[0];

  const ctx = tx.createEphemeral(BContext);

  // setting id
  tx.createField(field(ctx, BContextId), 'Input', Pl.createPlString(tx, randomUUID()));

  // setting parents
  for (let i = 0; i < upstreamCtxs.length; i++)
    tx.createField(field(ctx, `${BContextMultiParentPrefix}${i}`), 'Input', upstreamCtxs[i]);

  tx.lock(ctx);

  return ctx;
}
