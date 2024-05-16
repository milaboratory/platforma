import {
  AnyRef,
  field,
  PlTransaction,
  ResourceRef,
  ResourceType
} from '@milaboratory/pl-ts-client-v2';
import { buildMap, constructFutureFieldRecord, pair, PlMapEntry } from './pl_util';

export const BContextEnd: ResourceType = { name: 'BContextEnd', version: '1' };
export const EphRenderTemplate: ResourceType = { name: 'EphRenderTemplate', version: '1' };

// TODO: add implementation for dual context heavy block.
export type BlockType =
  | 'LightBlock'
  | 'HeavyBlock'
  | 'DualContextHeavyBlock';

// export type BlockInputs = HeavyBlockInputs;//| LightBlockInputs | never;
//
// export function createTemplateBlock(
//   tx: PlTransaction,
//   tpl: ResourceRef,
//   blockType: BlockType,
//   inputs: BlockInputs
// ) {
//   switch (blockType) {
//     case 'HeavyBlock':
//       return createRenderHeavyBlock(tx, tpl, inputs as HeavyBlockInputs);
//     case 'LightBlock':
//       throw new Error('unimplemented');
//     // return createLightBlock(tx, tpl, inputs as LightBlockInputs);
//     case 'DualContextHeavyBlock':
//       throw new Error('unimplemented');
//     // TODO
//     // return '';
//     // default:
//     // assertNever(blockType)
//   }
// }

export interface HeavyBlockInputs {
  args: AnyRef;
  blockId: AnyRef;
  isProduction: AnyRef;
  context: AnyRef;
}

const HeavyBlockInputNames: (keyof HeavyBlockInputs)[] =
  ['args', 'blockId', 'isProduction', 'context'];

export interface HeavyBlockOutputs {
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
    HeavyBlockInputNames.map(n => pair(n, inputs[n])),
    HeavyBlockOutputNames
  );
}

export interface LightBlockInputs {
  args: AnyRef,
  blockId: AnyRef,
  stagingContext: AnyRef,
  productionContext: AnyRef,
}

const LightBlockInputsNames: (keyof LightBlockInputs)[] =
  ['args', 'blockId', 'stagingContext', 'productionContext'];

export interface LightBlockOutput {
  result: AnyRef;
}

export const LightBlockOutputNames: (keyof LightBlockOutput)[] = ['result'];

export function createLightBlock(
  tx: PlTransaction,
  tpl: ResourceRef,
  inputs: LightBlockInputs
): LightBlockOutput {
  return createEphRenderTemplate(
    tx, tpl,
    LightBlockInputsNames.map(n => pair(n, inputs[n])),
    LightBlockOutputNames
  );
}

/** Returns a reference to output map */
function createEphRenderTemplate<O extends string>(
  tx: PlTransaction,
  tpl: AnyRef,
  inputs: PlMapEntry[],
  outputNames: O[]
): Record<O, AnyRef> {
  const rId = tx.createEphemeral(EphRenderTemplate);

  const tplField = field(rId, 'template');
  const inputsField = field(rId, 'inputs');

  tx.createField(tplField, 'Input', tpl);
  tx.createField(inputsField, 'Input',
    buildMap(tx, inputs, true));
  tx.lockInputs(rId);

  return constructFutureFieldRecord(tx, rId,
    outputNames.map(n => `outputs/${n}`), 'Output');
}

export function createBContextEnd(tx: PlTransaction): ResourceRef {
  return tx.createEphemeral(BContextEnd);
}

