import { AnyResourceRef, PlTransaction, ResourceType } from '@milaboratory/pl-client-v2';
import { loadTemplate, prepareTemplateSource } from '../template';
import { BlockPackSpecCustom, BlockPackSpec, BlockPackSpecNotPrepared } from '../../model/block_pack_spec';
import { assertNever } from '@milaboratory/ts-helpers';

export const BlockPackCustomType: ResourceType = { name: 'BlockPackCustom', version: '1' };
export const BlockPackTemplateField = 'template';

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

function createCustomBlockPack(tx: PlTransaction, spec: BlockPackSpecCustom): AnyResourceRef {
  const template = loadTemplate(tx, spec.template);

  const bp = tx.createStruct(BlockPackCustomType);
  const templateInBP = { resourceId: bp, fieldName: BlockPackTemplateField };
  tx.createField(templateInBP, 'Input', template);
  tx.lock(bp);

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
