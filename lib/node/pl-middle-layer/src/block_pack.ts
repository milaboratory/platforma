import { AnyResourceRef, PlTransaction, ResourceType } from '@milaboratory/pl-ts-client-v2';
import { assertNever } from './util';
import { loadTemplate, prepareTemplateSource, TemplateSourceAny, TemplateSourcePrepared } from './template';

export const BlockPackCustom: ResourceType = { name: 'BlockPackCustom', version: '1' };
export const BlockPackTemplateField = 'template';

export interface BlockPackCustom<Tpl extends TemplateSourceAny = TemplateSourcePrepared> {
  type: 'custom';
  template: Tpl;
}

export type BlockPackSpec = BlockPackCustom;
export type BlockPackSpecNotPrepared = BlockPackCustom<TemplateSourceAny>;

export async function prepareBlockSpec(spec: BlockPackSpecNotPrepared): Promise<BlockPackSpec> {
  switch (spec.type) {
    case 'custom':
      return {
        type: 'custom',
        template: await prepareTemplateSource(spec.template)
      };
    default:
      return assertNever(spec.type);
  }
}

function createCustomBlockPack(tx: PlTransaction, spec: BlockPackCustom): AnyResourceRef {
  const template = loadTemplate(tx, spec.template);

  const bp = tx.createStruct(BlockPackCustom);
  const templateInBP = { resourceId: bp, fieldName: BlockPackTemplateField };
  tx.createField(templateInBP, 'Input');
  tx.lock(bp);
  tx.setField(templateInBP, template);

  return bp;
}

export function createBlockPack(tx: PlTransaction, spec: BlockPackSpec): AnyResourceRef {
  switch (spec.type) {
    case 'custom':
      return createCustomBlockPack(tx, spec);
    default:
      return assertNever(spec.type);
  }
}
