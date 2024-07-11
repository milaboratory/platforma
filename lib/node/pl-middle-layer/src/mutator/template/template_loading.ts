import { AnyRef, field, Pl, PlTransaction, ResourceType } from '@milaboratory/pl-client-v2';
import fs from 'node:fs';
import { ExplicitTemplate, TemplateFromRegistry, TemplateSpecAny, TemplateSpecPrepared } from '../../model/template_spec';
import { assertNever } from '@milaboratory/ts-helpers';

//
// Resource schema
//

export const TengoTemplateGet: ResourceType = { name: 'TengoTemplateGet', version: '1' };
export const TengoTemplateGetRegistry = 'registry';
export const TengoTemplateGetTemplateURI = 'templateURI';
export const TengoTemplateGetTemplate = 'template';

export const TengoTemplatePack: ResourceType = { name: 'TengoTemplatePack', version: '1' };
export const TengoTemplatePackConvert: ResourceType = { name: 'TengoTemplatePackConvert', version: '1' };
export const TengoTemplatePackConvertTemplatePack = 'templatePack';
export const TengoTemplatePackConvertTemplate = 'template';

export async function prepareTemplateSpec(tpl: TemplateSpecAny): Promise<TemplateSpecPrepared> {
  switch (tpl.type) {
    case 'from-file':
      return {
        type: 'explicit',
        content: await fs.promises.readFile(tpl.path)
      };
    case 'from-registry':
    case 'explicit':
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

function loadTemplateFromExplicit(tx: PlTransaction, spec: ExplicitTemplate): AnyRef {
  const templatePack = tx.createValue(TengoTemplatePack, spec.content);
  const templatePackConvert = tx.createStruct(TengoTemplatePackConvert);
  const templatePackField = field(templatePackConvert, TengoTemplatePackConvertTemplatePack);
  const template = field(templatePackConvert, TengoTemplatePackConvertTemplate);

  tx.setField(templatePackField, templatePack);

  return template;
}

export function loadTemplate(tx: PlTransaction, spec: TemplateSpecPrepared): AnyRef {
  switch (spec.type) {
    case 'from-registry':
      return loadTemplateFromRegistry(tx, spec);
    case 'explicit':
      return loadTemplateFromExplicit(tx, spec);
    default:
      return assertNever(spec);
  }
}
