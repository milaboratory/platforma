import type { AnyRef, AnyResourceRef, PlTransaction } from '@milaboratories/pl-client';
import { assertNever } from '@milaboratories/ts-helpers';
import type { ExplicitTemplate, PreparedTemplate } from '../../model/template_spec';
import type { Hash } from 'node:crypto';
import { createHash } from 'node:crypto';
import type {
  TemplateData,
  TemplateLibData,
  TemplateSoftwareData,
} from '@milaboratories/pl-model-backend';
import {
  PlTemplateLibV1,
  PlTemplateSoftwareV1,
  PlTemplateV1,
  PlTemplateOverrideV1,
  parseTemplate,
} from '@milaboratories/pl-model-backend';

export function loadTemplateFromExplicitDirect(
  tx: PlTransaction,
  spec: ExplicitTemplate,
): AnyRef {
  const templateInfo: TemplateData = parseTemplate(spec.content);

  const templateFormat = templateInfo.type;
  switch (templateFormat) {
    case 'pl.tengo-template.v2':
      return createTemplateV2Tree(tx, templateInfo);
    default:
      assertNever(templateFormat);
  }
}

export function loadTemplateFromPrepared(
  tx: PlTransaction,
  spec: PreparedTemplate,
): AnyRef {
  const templateData: TemplateData = spec.data;

  const templateFormat = templateData.type;
  switch (templateFormat) {
    case 'pl.tengo-template.v2':
      return createTemplateV2Tree(tx, templateData);
    default:
      assertNever(templateFormat);
  }
}

type Renderer<T> = {
  hash: Hasher<T>;
  render: (resource: T, tx: PlTransaction, creator: Creator) => AnyResourceRef;
};
type Hasher<T> = (resource: T, hash: Hash) => void;
type Creator = <T>(resource: T, renderer: Renderer<T>) => AnyResourceRef;

const LibRenderer: Renderer<TemplateLibData> = {
  hash(resource, hash) {
    hash
      .update(PlTemplateLibV1.type.name)
      .update(PlTemplateLibV1.type.version)
      .update(resource.name)
      .update(resource.version)
      .update(resource.src);
  },
  render(resource, tx, _creator) {
    return tx.createValue(
      PlTemplateLibV1.type,
      JSON.stringify(PlTemplateLibV1.fromV2Data(resource).data),
    );
  },
};

const SoftwareInfoRenderer: Renderer<TemplateSoftwareData> = {
  hash(resource, hash) {
    hash
      .update(PlTemplateSoftwareV1.type.name)
      .update(PlTemplateSoftwareV1.type.version)
      .update(resource.name)
      .update(resource.version)
      .update(resource.src);
  },
  render(resource, tx, _creator) {
    const sw = PlTemplateSoftwareV1.fromV2Data(resource);
    const ref = tx.createStruct(PlTemplateSoftwareV1.type, sw.data);
    tx.setKValue(ref, PlTemplateSoftwareV1.metaNameKey, JSON.stringify(sw.name));
    tx.lock(ref);
    return ref;
  },
};

const TemplateRenderer: Renderer<TemplateData> = {
  hash(resource, hash) {
    hash
      .update(PlTemplateV1.type.name)
      .update(PlTemplateV1.type.version)
      .update(resource.hashOverride ?? 'no-override')
      .update(resource.name)
      .update(resource.version)
      .update(resource.src);

    const srt = <T>(entries: [string, T][]): [string, T][] => {
      entries.sort((a, b) => (a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1));
      return entries;
    };

    for (const [libId, lib] of srt(Object.entries(resource.libs ?? {}))) {
      hash.update('lib:' + libId);
      LibRenderer.hash(lib, hash);
    }
    for (const [swId, sw] of srt(Object.entries(resource.software ?? {}))) {
      hash.update('soft:' + swId);
      SoftwareInfoRenderer.hash(sw, hash);
    }
    for (const [swId, sw] of srt(Object.entries(resource.assets ?? {}))) {
      hash.update('asset:' + swId);
      SoftwareInfoRenderer.hash(sw, hash);
    }
    for (const [tplId, tpl] of srt(Object.entries(resource.templates ?? {}))) {
      hash.update('tpl:' + tplId);
      this.hash(tpl, hash);
    }
  },
  render(resource, tx, _creator) {
    const tplRef = tx.createStruct(
      PlTemplateV1.type,
      JSON.stringify(PlTemplateV1.fromV2Data(resource).data),
    );
    // Render libraries
    for (const [libId, lib] of Object.entries(resource.libs ?? {})) {
      const fld = PlTemplateV1.libField(tplRef, libId);
      tx.createField(fld, 'Input');
      tx.setField(fld, _creator(lib, LibRenderer));
    }

    // Render software and assets
    for (const [swId, sw] of Object.entries(resource.software ?? {})) {
      const fld = PlTemplateV1.swField(tplRef, swId);
      tx.createField(fld, 'Input');
      tx.setField(fld, _creator(sw, SoftwareInfoRenderer));
    }
    for (const [swId, sw] of Object.entries(resource.assets ?? {})) {
      const fld = PlTemplateV1.swField(tplRef, swId);
      tx.createField(fld, 'Input');
      tx.setField(fld, _creator(sw, SoftwareInfoRenderer));
    }

    // Render dependency templates
    for (const [depTplId, depTpl] of Object.entries(resource.templates ?? {})) {
      const fld = PlTemplateV1.tplField(tplRef, depTplId);
      tx.createField(fld, 'Input');
      tx.setField(fld, _creator(depTpl, TemplateRenderer));
    }

    tx.lock(tplRef);

    if (!resource.hashOverride) return tplRef;

    // Override template hash with proxy resource, when hash override is configured for template
    const overrideRef = tx.createStruct(
      PlTemplateOverrideV1.type,
      JSON.stringify(PlTemplateOverrideV1.fromV2Data(resource)),
    );
    const fld = PlTemplateOverrideV1.tplField(overrideRef);
    tx.createField(fld, 'Service');
    tx.setField(fld, tplRef);
    tx.lock(overrideRef);
    return overrideRef;
  },
};

function createTemplateV2Tree(tx: PlTransaction, tplData: TemplateData): AnyRef {
  const resourceCache = new Map<string, AnyResourceRef>();

  const createResource = <T>(resource: T, renderer: Renderer<T>): AnyResourceRef => {
    const hasher: Hash = createHash('sha256');
    renderer.hash(resource, hasher);

    const rKey = hasher.digest('hex');

    if (!resourceCache.has(rKey)) {
      const rId = renderer.render(resource, tx, createResource);
      resourceCache.set(rKey, rId);
    }

    return resourceCache.get(rKey)!;
  };

  return createResource(tplData, TemplateRenderer);
}
