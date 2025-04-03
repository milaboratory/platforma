import type { AnyRef, PlTransaction, ResourceType } from '@milaboratories/pl-client';
import { field, Pl } from '@milaboratories/pl-client';
import fs from 'node:fs';
import type {
  TemplateFromRegistry,
  TemplateSpecAny,
  TemplateSpecPrepared,
} from '../../model/template_spec';
import { assertNever } from '@milaboratories/ts-helpers';
import { loadTemplateFromExplicitDirect, loadTemplateFromUnpacked } from './direct_template_loader';

//
// Resource schema
//

export const TengoTemplateGet: ResourceType = { name: 'TengoTemplateGet', version: '1' };
export const TengoTemplateGetRegistry = 'registry';
export const TengoTemplateGetTemplateURI = 'templateURI';
export const TengoTemplateGetTemplate = 'template';

export const TengoTemplatePack: ResourceType = { name: 'TengoTemplatePack', version: '1' };
export const TengoTemplatePackConvert: ResourceType = {
  name: 'TengoTemplatePackConvert',
  version: '1',
};
export const TengoTemplatePackConvertTemplatePack = 'templatePack';
export const TengoTemplatePackConvertTemplate = 'template';

export async function prepareTemplateSpec(tpl: TemplateSpecAny): Promise<TemplateSpecPrepared> {
  switch (tpl.type) {
    case 'from-file':
      return {
        type: 'explicit',
        content: await fs.promises.readFile(tpl.path),
      };
    case 'from-registry':
    case 'explicit':
      return tpl;
    case 'unpacked':
      return tpl;
    default:
      return assertNever(tpl);
  }
}

function loadTemplateFromRegistry(tx: PlTransaction, spec: TemplateFromRegistry): AnyRef {
  const getTemplate = tx.createStruct(TengoTemplateGet);
  const registry = field(getTemplate, TengoTemplateGetRegistry);
  const uri = field(getTemplate, TengoTemplateGetTemplateURI);
  const templateFromRegistry = field(getTemplate, TengoTemplateGetTemplate);

  // Note: it has a resource schema, so platforma creates fields by itself.

  tx.setField(registry, tx.createValue(Pl.JsonString, Buffer.from(JSON.stringify(spec.registry))));
  tx.setField(uri, tx.createValue(Pl.JsonString, Buffer.from(JSON.stringify(spec.path))));

  return templateFromRegistry;
}

export function loadTemplate(tx: PlTransaction, spec: TemplateSpecPrepared): AnyRef {
  switch (spec.type) {
    case 'from-registry':
      return loadTemplateFromRegistry(tx, spec);
    case 'explicit':
      return loadTemplateFromExplicitDirect(tx, spec);
    case 'unpacked':
      return loadTemplateFromUnpacked(tx, spec);
    default:
      return assertNever(spec);
  }
}
