import type { AnyRef, AnyResourceRef, PlTransaction } from "@milaboratories/pl-client";
import type { Hash } from "node:crypto";
import { createHash } from "node:crypto";
import type {
  CompiledTemplateV4,
  TemplateLibDataV3,
  TemplateNodeV4,
  TemplateSoftwareDataV3,
  TemplateWasmDataV3,
} from "@milaboratories/pl-model-backend";
import {
  PlTemplateLibV1,
  PlTemplateSoftwareV1,
  PlTemplateV1,
  PlTemplateOverrideV1,
  PlWasmV1,
  resolveTemplate,
  templateCycleError,
} from "@milaboratories/pl-model-backend";
import { notEmpty } from "@milaboratories/ts-helpers";

/**
 * Renders the template graph into pl resources, caching by cache key.
 *
 * Differs from the v3 renderer in one way that matters: a v4 pack addresses
 * sub-templates by content hash, and that hash already covers the whole
 * subtree. So a template's cache key can fold in its children's hashes
 * directly instead of re-deriving them by walking the subtree.
 *
 * Under v3 that walk ran on every `createResourceCached` call, including
 * cache hits, and it walked the *expanded* tree. On a real block
 * (sequence-embeddings 1.4.1: 39 distinct templates, 11,672 expanded nodes)
 * it visited 35,920 nodes and made 2.8M `hash.update` calls to produce 39
 * resources. Here it is one visit per distinct node.
 */
export function createTemplateV4Tree(tx: PlTransaction, pack: CompiledTemplateV4): AnyRef {
  const resourceCache = new Map<string, AnyResourceRef>();
  const context: RenderContext = {
    hashToSource: pack.hashToSource,
    pack,
    visiting: new Set<TemplateNodeV4>(),
  };

  const createResourceCached = <T>(
    resource: T,
    renderer: Renderer<T>,
    ctx: RenderContext,
  ): AnyResourceRef => {
    const key: Hash = createHash("sha256");
    renderer.updateCacheKey(resource, key, ctx);

    const rKey = key.digest("hex");

    if (!resourceCache.has(rKey)) {
      const rId = renderer.render(resource, tx, createResourceCached, ctx);
      resourceCache.set(rKey, rId);
    }

    return resourceCache.get(rKey)!;
  };

  return createResourceCached(resolveTemplate(pack, pack.template), TemplateRenderer, context);
}

/** Everything a renderer needs to resolve a reference: sources by hash, and
 *  template nodes by hash. Bundled so renderers keep a single context
 *  parameter rather than growing one per lookup table. */
interface RenderContext {
  hashToSource: Record<string, string>;
  pack: CompiledTemplateV4;
  /** Nodes on the current path, so a reference cycle is reported instead of
   *  recursing until the stack runs out. */
  visiting: Set<TemplateNodeV4>;
}

type Renderer<T> = {
  /** Updates the cache key by adding all info of the artifact. */
  updateCacheKey: CacheKey<T>;
  /** Create resources for all dependencies recursively and then for this artifact. */
  render: (resource: T, tx: PlTransaction, creator: Creator, ctx: RenderContext) => AnyResourceRef;
};
type CacheKey<T> = (resource: T, key: Hash, ctx: RenderContext) => void;
type Creator = <T>(resource: T, renderer: Renderer<T>, ctx: RenderContext) => AnyResourceRef;

const LibRenderer: Renderer<TemplateLibDataV3> = {
  updateCacheKey(resource, hash, _ctx) {
    // sourceHash is already the sha256 of this source (the hashToSource key), so hash it
    // directly instead of streaming the full source through sha256 again.
    hash
      .update(PlTemplateLibV1.type.name)
      .update(PlTemplateLibV1.type.version)
      .update(resource.name)
      .update(resource.version)
      .update(resource.sourceHash);
  },
  render(resource, tx, _creator, ctx) {
    return tx.createValue(
      PlTemplateLibV1.type,
      JSON.stringify(
        PlTemplateLibV1.fromV3Data(
          resource,
          getSourceCode(resource.name, ctx.hashToSource, resource.sourceHash),
        ).data,
      ),
    );
  },
};

const WasmRenderer: Renderer<TemplateWasmDataV3> = {
  updateCacheKey(resource, hash, _ctx) {
    hash
      .update(PlWasmV1.type.name)
      .update(PlWasmV1.type.version)
      .update(resource.name)
      .update(resource.version)
      .update(resource.sourceHash);
  },
  render(resource, tx, _creator, ctx) {
    return tx.createValue(
      PlWasmV1.type,
      JSON.stringify(
        PlWasmV1.fromV3Data(
          resource,
          getSourceCode(resource.name, ctx.hashToSource, resource.sourceHash),
        ).data,
      ),
    );
  },
};

const SoftwareInfoRenderer: Renderer<TemplateSoftwareDataV3> = {
  updateCacheKey(resource, hash, _ctx) {
    hash
      .update(PlTemplateSoftwareV1.type.name)
      .update(PlTemplateSoftwareV1.type.version)
      .update(resource.name)
      .update(resource.version)
      .update(resource.sourceHash);
  },
  render(resource, tx, _creator, ctx) {
    const sw = PlTemplateSoftwareV1.fromV3Data(
      resource,
      getSourceCode(resource.name, ctx.hashToSource, resource.sourceHash),
    );
    const ref = tx.createStruct(PlTemplateSoftwareV1.type, sw.data);
    tx.setKValue(ref, PlTemplateSoftwareV1.metaNameKey, JSON.stringify(sw.name));
    tx.lock(ref);
    return ref;
  },
};

const TemplateRenderer: Renderer<TemplateNodeV4> = {
  updateCacheKey(resource, hash, ctx) {
    hash
      .update(PlTemplateV1.type.name)
      .update(PlTemplateV1.type.version)
      .update(resource.hashOverride ?? "no-override")
      .update(resource.name)
      .update(resource.version)
      .update(resource.sourceHash);

    const srt = <T>(entries: [string, T][]): [string, T][] => {
      entries.sort((a, b) => (a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1));
      return entries;
    };

    for (const [libId, lib] of srt(Object.entries(resource.libs ?? {}))) {
      hash.update("lib:" + libId);
      LibRenderer.updateCacheKey(lib, hash, ctx);
    }
    for (const [swId, sw] of srt(Object.entries(resource.software ?? {}))) {
      hash.update("soft:" + swId);
      SoftwareInfoRenderer.updateCacheKey(sw, hash, ctx);
    }
    for (const [swId, sw] of srt(Object.entries(resource.assets ?? {}))) {
      hash.update("asset:" + swId);
      SoftwareInfoRenderer.updateCacheKey(sw, hash, ctx);
    }
    // The child's content hash covers its entire subtree, so folding the hash
    // in is equivalent to recursing into it — at one update instead of a walk.
    for (const [tplId, tplHash] of srt(Object.entries(resource.templates ?? {}))) {
      hash.update("tpl:" + tplId).update(tplHash);
    }
    for (const [wasmId, wasm] of srt(Object.entries(resource.wasm ?? {}))) {
      hash.update("wasm:" + wasmId);
      WasmRenderer.updateCacheKey(wasm, hash, ctx);
    }
  },
  render(resource, tx, _creator, ctx) {
    const tplRef = tx.createStruct(
      PlTemplateV1.type,
      JSON.stringify(
        PlTemplateV1.fromV3Data(
          resource,
          getSourceCode(resource.name, ctx.hashToSource, resource.sourceHash),
        ).data,
      ),
    );
    // Render libraries
    for (const [libId, lib] of Object.entries(resource.libs ?? {})) {
      const fld = PlTemplateV1.libField(tplRef, libId);
      tx.createField(fld, "Input");
      tx.setField(fld, _creator(lib, LibRenderer, ctx));
    }

    // Render software and assets
    for (const [swId, sw] of Object.entries(resource.software ?? {})) {
      const fld = PlTemplateV1.swField(tplRef, swId);
      tx.createField(fld, "Input");
      tx.setField(fld, _creator(sw, SoftwareInfoRenderer, ctx));
    }
    for (const [swId, sw] of Object.entries(resource.assets ?? {})) {
      const fld = PlTemplateV1.swField(tplRef, swId);
      tx.createField(fld, "Input");
      tx.setField(fld, _creator(sw, SoftwareInfoRenderer, ctx));
    }

    // Render dependency templates
    ctx.visiting.add(resource);
    for (const [depTplId, depTplHash] of Object.entries(resource.templates ?? {})) {
      const child = resolveTemplate(ctx.pack, depTplHash);
      if (ctx.visiting.has(child)) throw templateCycleError(child);
      const fld = PlTemplateV1.tplField(tplRef, depTplId);
      tx.createField(fld, "Input");
      tx.setField(fld, _creator(child, TemplateRenderer, ctx));
    }
    ctx.visiting.delete(resource);

    // Render wasm dependencies. The field name (alias) feeds straight into
    // the backend's TengoTemplateV1.wasm map and becomes the lookup key in
    // RuntimeV1.deps.Wasm consumed by plapi.loadWasm.
    for (const [wasmId, wasm] of Object.entries(resource.wasm ?? {})) {
      const fld = PlTemplateV1.wasmField(tplRef, wasmId);
      tx.createField(fld, "Input");
      tx.setField(fld, _creator(wasm, WasmRenderer, ctx));
    }

    tx.lock(tplRef);

    if (!resource.hashOverride) return tplRef;

    // Override template hash with proxy resource, when hash override is configured for template
    const overrideRef = tx.createStruct(
      PlTemplateOverrideV1.type,
      JSON.stringify(PlTemplateOverrideV1.fromV3Data(resource)),
    );
    const fld = PlTemplateOverrideV1.tplField(overrideRef);
    tx.createField(fld, "Service");
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
