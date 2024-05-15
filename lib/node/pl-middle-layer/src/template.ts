import { AnyRef, field, KnownResourceTypes, PlTransaction, ResourceType } from '@milaboratory/pl-ts-client-v2';
import { assertNever } from './util';
import fs from 'node:fs';

export const TengoTemplateGet: ResourceType = { name: 'TengoTemplateGet', version: '1' };
export const TengoTemplateGetRegistry = 'registry';
export const TengoTemplateGetTemplateURI = 'templateURI';
export const TengoTemplateGetTemplatePack = 'templatePack';

export const TengoTemplatePack: ResourceType = { name: 'TengoTemplatePack', version: '1' };

export const TengoTemplatePackConvert: ResourceType = { name: 'TengoTemplatePackConvert', version: '1' };
export const TengoTemplatePackConvertTemplatePack = 'templatePack';
export const TengoTemplatePackConvertTemplate = 'template';

export interface TemplateFromRegistry {
  readonly type: 'from-registry';
  registry: string;
  path: string;
}

export interface ExplicitTemplate {
  readonly type: 'explicit';
  content: Uint8Array;
}

export interface TemplateFromFile {
  readonly type: 'from-file';
  path: string;
}

export type TemplateSourcePrepared = TemplateFromRegistry | ExplicitTemplate;
export type TemplateSourceAny = TemplateSourcePrepared | TemplateFromFile;

export async function prepareTemplateSource(tpl: TemplateSourceAny): Promise<TemplateSourcePrepared> {
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
  const templateFromRegistry = field(getTemplate, TengoTemplateGetTemplatePack);

  // Note: it has a resource schema, so platforma creates fields by itself.
  // tx.createField(registry, 'Input');
  // tx.createField(uri, 'Input');
  // tx.createField(templateFromRegistry, 'Output');
  // tx.lock(getTemplate);

  tx.setField(registry, tx.createValue(KnownResourceTypes.JsonString, Buffer.from(JSON.stringify(spec.registry))));
  tx.setField(uri, tx.createValue(KnownResourceTypes.JsonString, Buffer.from(JSON.stringify(spec.path))));

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

export function loadTemplate(tx: PlTransaction, spec: TemplateSourcePrepared): AnyRef {
  switch (spec.type) {
    case 'from-registry':
      return loadTemplateFromRegistry(tx, spec);
    case 'explicit':
      return loadTemplateFromExplicit(tx, spec);
    default:
      return assertNever(spec);
  }
}
