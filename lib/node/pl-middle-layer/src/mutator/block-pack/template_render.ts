import {
  AnyRef,
  field,
  PlTransaction,
  ResourceRef,
  ResourceType, Pl
} from '@milaboratory/pl-client-v2';
import { randomUUID } from 'node:crypto';

export const BContextEnd: ResourceType = { name: 'BContextEnd', version: '1' };
export const BContext: ResourceType = { name: 'BContext', version: '1' };
export const BContextId = 'id';
export const BContextParent = 'parent';
export const BContextMultiParentPrefix = 'parent/';
export const EphRenderTemplate: ResourceType = { name: 'EphRenderTemplate', version: '1' };

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
}

export type HeavyBlockOutputs = {
  context: AnyRef;
  result: AnyRef;
}

export const HeavyBlockOutputNames: (keyof HeavyBlockOutputs)[] =
  ['context', 'result'];

export function createRenderHeavyBlock(
  tx: PlTransaction,
  tpl: AnyRef,
  inputs: HeavyBlockInputs
): HeavyBlockOutputs {
  return createEphRenderTemplate(
    tx, tpl,
    inputs,
    HeavyBlockOutputNames
  );
}

export type LightBlockInputs = {
  args: AnyRef,
  blockId: AnyRef,
  stagingContext: AnyRef,
  productionContext: AnyRef,
}

export type LightBlockOutput = {
  result: AnyRef;
}

export const LightBlockOutputNames: (keyof LightBlockOutput)[] = ['result'];

export function createRenderLightBlock(
  tx: PlTransaction,
  tpl: ResourceRef,
  inputs: LightBlockInputs
): LightBlockOutput {
  return createEphRenderTemplate(
    tx, tpl, inputs, LightBlockOutputNames
  );
}

/** Returns a reference to output map */
function createEphRenderTemplate<O extends string>(
  tx: PlTransaction,
  tpl: AnyRef,
  inputs: Pl.PlRecord,
  outputNames: O[]
): Record<O, AnyRef> {
  const rId = tx.createEphemeral(EphRenderTemplate);

  const tplField = field(rId, 'template');
  const inputsField = field(rId, 'inputs');

  tx.createField(tplField, 'Input', tpl);
  tx.createField(inputsField, 'Input',
    Pl.createPlMap(tx, inputs, true));
  tx.lockInputs(rId);

  return Pl.futureRecord(tx, rId, outputNames, 'Output', 'outputs/');
}

export function createBContextEnd(tx: PlTransaction): ResourceRef {
  return tx.createEphemeral(BContextEnd);
}

export function createBContextFromUpstreams(tx: PlTransaction,
                                            upstreamCtxs: AnyRef[]): AnyRef {
  if (upstreamCtxs.length === 0)
    return createBContextEnd(tx);

  if (upstreamCtxs.length === 1)
    return upstreamCtxs[0];

  const ctx = tx.createEphemeral(BContext);

  // setting id
  tx.createField(field(ctx, BContextId), 'Input',
    Pl.createPlString(tx, randomUUID()));

  // setting parents
  for (let i = 0; i < upstreamCtxs.length; i++)
    tx.createField(field(ctx, `${BContextMultiParentPrefix}${i}`),
      'Input', upstreamCtxs[i]);

  tx.lock(ctx);

  return ctx;
}
