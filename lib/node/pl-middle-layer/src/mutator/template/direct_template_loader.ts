import { AnyRef, PlTransaction, resourceType } from '@milaboratories/pl-client';
import { ExplicitTemplate } from '../../model/template_spec';
import { Hash } from 'crypto';
import {
  TemplateLibData,
  templateLibDataToPl,
  TemplateSoftwareData
} from '@milaboratories/pl-model-backend';

type Renderer<T> = {
  hash: (data: T, hash: Hash) => void;
  render: (data: T, tx: PlTransaction, creator: Creator<T>) => AnyRef;
};
type Creator<T> = (data: T, renderer: Renderer<T>) => AnyRef;

const TengoLibV1RT = resourceType('TengoLib', '1');
const LibRenderer: Renderer<TemplateLibData> = {
  hash(data, hash) {
    hash
      .update(TengoLibV1RT.name)
      .update(TengoLibV1RT.version)
      .update(data.name)
      .update(data.version)
      .update(data.src);
  },
  render(data, tx, creator) {
    return tx.createValue(TengoLibV1RT, JSON.stringify(templateLibDataToPl(data)));
  }
};

const SoftwareInfoV1RT = resourceType('SoftwareInfo', '1');
const SoftwareInstalledPackageMetadataNameKey       = "ctl/runner/package/name"
const SoftwareInfoRenderer: Renderer<TemplateSoftwareData> = {
  hash(data, hash) {
    hash
      .update(SoftwareInfoV1RT.name)
      .update(SoftwareInfoV1RT.version)
      .update(data.name)
      .update(data.version)
      .update(data.src);
  },
  render(data, tx, creator) {
    const ref = tx.createStruct(SoftwareInfoV1RT, data.src);
    tx.setKValue(ref,)
    return ref;
  }
};

const TengoTemplateV1RT = resourceType('TengoTemplate', '1');
const TengoTemplateFieldLibPrefix = 'lib';
const TengoTemplateFieldTplPrefix = 'tpl';

function loadTemplateFromExplicitDirect(tx: PlTransaction, spec: ExplicitTemplate): AnyRef {
  // holds a cache from hash to resource ref to prevent recreating same resources
  const resources = new Map<string, AnyRef>();

  //   const creareResource = <T>(data: T, hasher: Hasher<T>, renderer: <T>) => {

  //   }

  // const templatePack = tx.createValue(TengoTemplatePack, spec.content);
  // const templatePackConvert = tx.createStruct(TengoTemplatePackConvert);
  // const templatePackField = field(templatePackConvert, TengoTemplatePackConvertTemplatePack);
  // const template = field(templatePackConvert, TengoTemplatePackConvertTemplate);

  // tx.setField(templatePackField, templatePack);

  // return template;
}
