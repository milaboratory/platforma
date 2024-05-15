import { AnyRef, FieldRef, PlTransaction, ResourceId, ResourceRef, ResourceType } from '@milaboratory/pl-ts-client-v2';
import { assertNever } from './util';

export const BContextEnd: ResourceType = { name: 'BContextEnd', version: '1' };
export const EphStdMap: ResourceType = { name: 'EphStdMap', version: '1' };
export const EphRenderTemplate: ResourceType = { name: 'EphRenderTemplate', version: '1' };

// TODO: add implementation for dual context heavy block.
export type BlockType =
  | 'LightBlock'
  | 'HeavyBlock'
  | 'DualContextHeavyBlock';

export type BlockInputs = HeavyBlockInputs | LightBlockInputs | never;

export function createTemplateBlock(
  tx: PlTransaction,
  tpl: ResourceRef,
  blockType: BlockType,
  inputs: BlockInputs,
  data?: Uint8Array,
) {
  switch(blockType) {
    case 'HeavyBlock':
      return createHeavyBlock(tx, tpl, inputs as HeavyBlockInputs);
    case 'LightBlock':
      return createLightBlock(tx, tpl, inputs as LightBlockInputs);
    case 'DualContextHeavyBlock':
      throw new Error('unimplemented');
      // TODO
      // return '';
      // default:
      // assertNever(blockType)
  }
}

export interface HeavyBlockInputs {
  args: AnyRef,
  blockId: AnyRef,
  isProduction: AnyRef,
  context: AnyRef,
}

export const HeavyBlockOutputNames = ["context", "result"];

export function createHeavyBlock(
  tx: PlTransaction,
  tpl: ResourceRef,
  inputs: HeavyBlockInputs,
  data?: Uint8Array,
) {
  const inputNames = Object.keys(inputs);
  return createEphRenderTemplate(
    tx, tpl, inputNames, HeavyBlockOutputNames, data,
  );
}

export interface LightBlockInputs {
  args: ResourceId,
  blockId: ResourceId,
  stagingContext: ResourceId,
  productionContext: ResourceId,
}

export const LightBlockOutputNames = ["result"]

export function createLightBlock(
  tx: PlTransaction,
  tpl: ResourceRef,
  inputs: LightBlockInputs,
  data?: Uint8Array,
) {
  const inputNames = Object.keys(inputs);
  return createEphRenderTemplate(
    tx, tpl, inputNames, LightBlockOutputNames, data,
  );
}

function createEphRenderTemplate(
  tx: PlTransaction,
  tpl: ResourceRef,
  inputNames: string[],
  outputNames: string[],
  data?: Uint8Array,
): {
  rId: ResourceRef,
  inputs: Map<string, FieldRef>,
  outputs: Map<string, FieldRef>,
} {
  const rId = tx.createEphemeral(EphRenderTemplate, data);

  const tplField: FieldRef = { resourceId: rId, fieldName: 'template' };
  tx.createField(tplField, 'Input');
  tx.setField(tplField, tpl);

  const inputs = createEphStdMap(tx, inputNames);
  const inputsField = { resourceId: rId, fieldName: 'inputs' };
  tx.createField(inputsField, 'Input');
  tx.setField(inputsField, inputs.rId);

  const outputs = new Map(outputNames.map(
    (n) => [
      n,
      tx.getFutureFieldValue(rId, `outputs/${n}`, 'Output'),
    ]
  ));

  tx.lockInputs(rId);

  return {
    rId: rId,
    inputs: inputs.nameToId,
    outputs: outputs,
  };
}

export function createBContextEnd(tx: PlTransaction): ResourceRef {
  return tx.createEphemeral(BContextEnd);
}

function createEphStdMap(tx: PlTransaction, fieldNames: string[]) {
  const rId = tx.createEphemeral(EphStdMap);

  const nameToId = new Map(fieldNames.map((n) => {
    return [n, { resourceId: rId, fieldName: n }]
  }));

  nameToId.forEach((id) => tx.createField(id, 'Input'));

  tx.lock(rId);

  return {
    rId,
    nameToId,
  }
}

