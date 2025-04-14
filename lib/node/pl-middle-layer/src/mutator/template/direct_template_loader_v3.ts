import type { AnyRef, AnyResourceRef, PlTransaction } from '@milaboratories/pl-client';
import type { Hash } from 'node:crypto';
import { createHash } from 'node:crypto';
import type {
  CompiledTemplateV3,
  TemplateDataV3,
  TemplateLibDataV3,
  TemplateSoftwareDataV3,
} from '@milaboratories/pl-model-backend';
import {
  PlTemplateLibV1,
  PlTemplateSoftwareV1,
  PlTemplateV1,
  PlTemplateOverrideV1,
} from '@milaboratories/pl-model-backend';
import { notEmpty } from '@milaboratories/ts-helpers';

/**
 * Renders the tree of templates by caching all resource ids
 * by their cache keys.
 * It's different from v2 version because we provide
 * the hash map of the code of all sources everywhere.
 * It does a double-dispatch on the node type (template, library etc),
 * and creates resources.
 *
 * IMO, it'd be clearer to rewrite it with Visitor pattern, and separate
 * tree traversing and operations on it, but I don't have time to do it now.
*/
export function createTemplateV3Tree(tx: PlTransaction, tplData: CompiledTemplateV3): AnyRef {
  const resourceCache = new Map<string, AnyResourceRef>();

  const createResourceCached = <T>(resource: T, renderer: Renderer<T>, hashToSource: Record<string, string>): AnyResourceRef => {
    const key: Hash = createHash('sha256');
    renderer.updateCacheKey(resource, key, hashToSource);

    const rKey = key.digest('hex');

    if (!resourceCache.has(rKey)) {
      const rId = renderer.render(resource, tx, createResourceCached, hashToSource);
      resourceCache.set(rKey, rId);
    }

    return resourceCache.get(rKey)!;
  };

  return createResourceCached(tplData.template, TemplateRenderer, tplData.hashToSource);
}

type Renderer<T> = {
  /** Updates the cache key by adding all info of the artifact. */
  updateCacheKey: CacheKey<T>;
  /** Create resources for all dependencies recursively and then for this artifact. */
  render: (resource: T, tx: PlTransaction, creator: Creator, sources: Record<string, string>) => AnyResourceRef;
};
type CacheKey<T> = (resource: T, key: Hash, sources: Record<string, string>) => void;
type Creator = <T>(resource: T, renderer: Renderer<T>, sources: Record<string, string>) => AnyResourceRef;

const LibRenderer: Renderer<TemplateLibDataV3> = {
  updateCacheKey(resource, hash, sources) {
    hash
      .update(PlTemplateLibV1.type.name)
      .update(PlTemplateLibV1.type.version)
      .update(resource.name)
      .update(resource.version)
      .update(getSourceCode(resource.name, sources, resource.sourceHash));
  },
  render(resource, tx, _creator, sources) {
    return tx.createValue(
      PlTemplateLibV1.type,
      JSON.stringify(PlTemplateLibV1.fromV3Data(resource, getSourceCode(resource.name, sources, resource.sourceHash)).data),
    );
  },
};

const SoftwareInfoRenderer: Renderer<TemplateSoftwareDataV3> = {
  updateCacheKey(resource, hash, sources) {
    hash
      .update(PlTemplateSoftwareV1.type.name)
      .update(PlTemplateSoftwareV1.type.version)
      .update(resource.name)
      .update(resource.version)
      .update(getSourceCode(resource.name, sources, resource.sourceHash));
  },
  render(resource, tx, _creator, sources) {
    const sw = PlTemplateSoftwareV1.fromV3Data(resource, getSourceCode(resource.name, sources, resource.sourceHash));
    const ref = tx.createStruct(PlTemplateSoftwareV1.type, sw.data);
    tx.setKValue(ref, PlTemplateSoftwareV1.metaNameKey, JSON.stringify(sw.name));
    tx.lock(ref);
    return ref;
  },
};

const TemplateRenderer: Renderer<TemplateDataV3> = {
  updateCacheKey(resource, hash, sources) {
    hash
      .update(PlTemplateV1.type.name)
      .update(PlTemplateV1.type.version)
      .update(resource.hashOverride ?? 'no-override')
      .update(resource.name)
      .update(resource.version)
      .update(getSourceCode(resource.name, sources, resource.sourceHash));

    const srt = <T>(entries: [string, T][]): [string, T][] => {
      entries.sort((a, b) => (a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1));
      return entries;
    };

    for (const [libId, lib] of srt(Object.entries(resource.libs ?? {}))) {
      hash.update('lib:' + libId);
      LibRenderer.updateCacheKey(lib, hash, sources);
    }
    for (const [swId, sw] of srt(Object.entries(resource.software ?? {}))) {
      hash.update('soft:' + swId);
      SoftwareInfoRenderer.updateCacheKey(sw, hash, sources);
    }
    for (const [swId, sw] of srt(Object.entries(resource.assets ?? {}))) {
      hash.update('asset:' + swId);
      SoftwareInfoRenderer.updateCacheKey(sw, hash, sources);
    }
    for (const [tplId, tpl] of srt(Object.entries(resource.templates ?? {}))) {
      hash.update('tpl:' + tplId);
      this.updateCacheKey(tpl, hash, sources);
    }
  },
  render(resource, tx, _creator, sources) {
    const tplRef = tx.createStruct(
      PlTemplateV1.type,
      JSON.stringify(PlTemplateV1.fromV3Data(resource, getSourceCode(resource.name, sources, resource.sourceHash)).data),
    );
    // Render libraries
    for (const [libId, lib] of Object.entries(resource.libs ?? {})) {
      const fld = PlTemplateV1.libField(tplRef, libId);
      tx.createField(fld, 'Input');
      tx.setField(fld, _creator(lib, LibRenderer, sources));
    }

    // Render software and assets
    for (const [swId, sw] of Object.entries(resource.software ?? {})) {
      const fld = PlTemplateV1.swField(tplRef, swId);
      tx.createField(fld, 'Input');
      tx.setField(fld, _creator(sw, SoftwareInfoRenderer, sources));
    }
    for (const [swId, sw] of Object.entries(resource.assets ?? {})) {
      const fld = PlTemplateV1.swField(tplRef, swId);
      tx.createField(fld, 'Input');
      tx.setField(fld, _creator(sw, SoftwareInfoRenderer, sources));
    }

    // Render dependency templates
    for (const [depTplId, depTpl] of Object.entries(resource.templates ?? {})) {
      const fld = PlTemplateV1.tplField(tplRef, depTplId);
      tx.createField(fld, 'Input');
      tx.setField(fld, _creator(depTpl, TemplateRenderer, sources));
    }

    tx.lock(tplRef);

    if (!resource.hashOverride) return tplRef;

    // Override template hash with proxy resource, when hash override is configured for template
    const overrideRef = tx.createStruct(
      PlTemplateOverrideV1.type,
      JSON.stringify(PlTemplateOverrideV1.fromV3Data(resource)),
    );
    const fld = PlTemplateOverrideV1.tplField(overrideRef);
    tx.createField(fld, 'Service');
    tx.setField(fld, tplRef);
    tx.lock(overrideRef);
    return overrideRef;
  },
};

/**
 * Gets a source code of the artifact by its source hash.
 * the source hash was calculated and stored by tengo compiler
 * and is different from the hash we're using for caching here.
 */
function getSourceCode(name: string, sources: Record<string, string>, sourceHash: string): string {
  return notEmpty(
    sources[sourceHash],
    `trying to get "${name}" source: sources map doesn't contain source hash ${sourceHash}`,
  );
}
