import type { AnyRef, AnyResourceRef, PlTransaction } from "@milaboratories/pl-client";
import type { Hash } from "node:crypto";
import { createHash } from "node:crypto";
import type {
  CompiledTemplateV3,
  TemplateDataV3,
  TemplateLibDataV3,
  TemplateSoftwareDataV3,
  TemplateWasmDataV3,
} from "@milaboratories/pl-model-backend";
import {
  PlTemplateLibV1,
  PlTemplateSoftwareV1,
  PlTemplateV1,
  PlTemplateOverrideV1,
  PlWasmV1,
} from "@milaboratories/pl-model-backend";
import { notEmpty } from "@milaboratories/ts-helpers";

/**
 * Cache-key digest per template-tree node, memoised on the node object itself.
 *
 * A node's digest is a pure function of that node — the renderers below derive it from the
 * node's own name/version/sourceHash plus its children's digests, and never read the
 * `hashToSource` map. That buys two things:
 *
 *  - within one call, each subtree is hashed exactly once instead of once per ancestor
 *    (the digest of a child is folded in as a short hex string, not by re-walking it), and
 *  - across calls, a template tree that is handed to us again — which is the normal case,
 *    since `getPreparedExportTemplateEnvelope()` memoises one spec object for the process —
 *    costs nothing at all.
 *
 * Node objects are owned by the compiled template and never mutated, so keying on identity
 * is safe; a `WeakMap` keeps this from pinning specs that do get discarded.
 */
const cacheKeyByNode = new WeakMap<object, string>();

/** Child maps are keyed by alias; the digest must not depend on enumeration order. */
function sortedEntries<T>(children: Record<string, T> | undefined): [string, T][] {
  return Object.entries(children ?? {}).sort(([left], [right]) =>
    left === right ? 0 : left < right ? -1 : 1,
  );
}

function cacheKeyOf<T extends object>(resource: T, renderer: Renderer<T>): string {
  const memoised = cacheKeyByNode.get(resource);
  if (memoised !== undefined) return memoised;

  const hash: Hash = createHash("sha256");
  renderer.updateCacheKey(resource, hash);
  const digest = hash.digest("hex");

  cacheKeyByNode.set(resource, digest);
  return digest;
}

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

  const createResourceCached = <T extends object>(
    resource: T,
    renderer: Renderer<T>,
    hashToSource: Record<string, string>,
  ): AnyResourceRef => {
    const rKey = cacheKeyOf(resource, renderer);

    if (!resourceCache.has(rKey)) {
      const rId = renderer.render(resource, tx, createResourceCached, hashToSource);
      resourceCache.set(rKey, rId);
    }

    return resourceCache.get(rKey)!;
  };

  return createResourceCached(tplData.template, TemplateRenderer, tplData.hashToSource);
}

type Renderer<T> = {
  /**
   * Folds this artifact into `key`. Must cover everything that distinguishes one artifact
   * from another, and must fold children in via {@link cacheKeyOf} rather than by
   * recursing — recursion here is what made this quadratic in the size of the tree.
   */
  updateCacheKey: CacheKey<T>;
  /** Create resources for all dependencies recursively and then for this artifact. */
  render: (
    resource: T,
    tx: PlTransaction,
    creator: Creator,
    sources: Record<string, string>,
  ) => AnyResourceRef;
};
type CacheKey<T> = (resource: T, key: Hash) => void;
type Creator = <T extends object>(
  resource: T,
  renderer: Renderer<T>,
  sources: Record<string, string>,
) => AnyResourceRef;

const LibRenderer: Renderer<TemplateLibDataV3> = {
  updateCacheKey(resource, hash) {
    // sourceHash is already the sha256 of this source (the hashToSource key), so hash it
    // directly instead of streaming the full source through sha256 again.
    hash
      .update(PlTemplateLibV1.type.name)
      .update(PlTemplateLibV1.type.version)
      .update(resource.name)
      .update(resource.version)
      .update(resource.sourceHash);
  },
  render(resource, tx, _creator, sources) {
    return tx.createValue(
      PlTemplateLibV1.type,
      JSON.stringify(
        PlTemplateLibV1.fromV3Data(
          resource,
          getSourceCode(resource.name, sources, resource.sourceHash),
        ).data,
      ),
    );
  },
};

const WasmRenderer: Renderer<TemplateWasmDataV3> = {
  updateCacheKey(resource, hash) {
    hash
      .update(PlWasmV1.type.name)
      .update(PlWasmV1.type.version)
      .update(resource.name)
      .update(resource.version)
      .update(resource.sourceHash);
  },
  render(resource, tx, _creator, sources) {
    return tx.createValue(
      PlWasmV1.type,
      JSON.stringify(
        PlWasmV1.fromV3Data(resource, getSourceCode(resource.name, sources, resource.sourceHash))
          .data,
      ),
    );
  },
};

const SoftwareInfoRenderer: Renderer<TemplateSoftwareDataV3> = {
  updateCacheKey(resource, hash) {
    hash
      .update(PlTemplateSoftwareV1.type.name)
      .update(PlTemplateSoftwareV1.type.version)
      .update(resource.name)
      .update(resource.version)
      .update(resource.sourceHash);
  },
  render(resource, tx, _creator, sources) {
    const sw = PlTemplateSoftwareV1.fromV3Data(
      resource,
      getSourceCode(resource.name, sources, resource.sourceHash),
    );
    const ref = tx.createStruct(PlTemplateSoftwareV1.type, sw.data);
    tx.setKValue(ref, PlTemplateSoftwareV1.metaNameKey, JSON.stringify(sw.name));
    tx.lock(ref);
    return ref;
  },
};

const TemplateRenderer: Renderer<TemplateDataV3> = {
  updateCacheKey(resource, hash) {
    hash
      .update(PlTemplateV1.type.name)
      .update(PlTemplateV1.type.version)
      .update(resource.hashOverride ?? "no-override")
      .update(resource.name)
      .update(resource.version)
      .update(resource.sourceHash);

    // Children contribute their own (memoised) digest rather than their expanded contents.
    // Structurally equal subtrees still produce equal digests — this is a Merkle hash — but
    // each subtree is walked once per tree instead of once per ancestor.
    for (const [libId, lib] of sortedEntries(resource.libs)) {
      hash.update("lib:" + libId).update(cacheKeyOf(lib, LibRenderer));
    }
    for (const [swId, sw] of sortedEntries(resource.software)) {
      hash.update("soft:" + swId).update(cacheKeyOf(sw, SoftwareInfoRenderer));
    }
    for (const [assetId, asset] of sortedEntries(resource.assets)) {
      hash.update("asset:" + assetId).update(cacheKeyOf(asset, SoftwareInfoRenderer));
    }
    for (const [tplId, tpl] of sortedEntries(resource.templates)) {
      hash.update("tpl:" + tplId).update(cacheKeyOf(tpl, TemplateRenderer));
    }
    for (const [wasmId, wasm] of sortedEntries(resource.wasm)) {
      hash.update("wasm:" + wasmId).update(cacheKeyOf(wasm, WasmRenderer));
    }
  },
  render(resource, tx, _creator, sources) {
    const tplRef = tx.createStruct(
      PlTemplateV1.type,
      JSON.stringify(
        PlTemplateV1.fromV3Data(
          resource,
          getSourceCode(resource.name, sources, resource.sourceHash),
        ).data,
      ),
    );
    // Render libraries
    for (const [libId, lib] of Object.entries(resource.libs ?? {})) {
      const fld = PlTemplateV1.libField(tplRef, libId);
      tx.createField(fld, "Input");
      tx.setField(fld, _creator(lib, LibRenderer, sources));
    }

    // Render software and assets
    for (const [swId, sw] of Object.entries(resource.software ?? {})) {
      const fld = PlTemplateV1.swField(tplRef, swId);
      tx.createField(fld, "Input");
      tx.setField(fld, _creator(sw, SoftwareInfoRenderer, sources));
    }
    for (const [swId, sw] of Object.entries(resource.assets ?? {})) {
      const fld = PlTemplateV1.swField(tplRef, swId);
      tx.createField(fld, "Input");
      tx.setField(fld, _creator(sw, SoftwareInfoRenderer, sources));
    }

    // Render dependency templates
    for (const [depTplId, depTpl] of Object.entries(resource.templates ?? {})) {
      const fld = PlTemplateV1.tplField(tplRef, depTplId);
      tx.createField(fld, "Input");
      tx.setField(fld, _creator(depTpl, TemplateRenderer, sources));
    }

    // Render wasm dependencies. The field name (alias) feeds straight into
    // the backend's TengoTemplateV1.wasm map and becomes the lookup key in
    // RuntimeV1.deps.Wasm consumed by plapi.loadWasm.
    for (const [wasmId, wasm] of Object.entries(resource.wasm ?? {})) {
      const fld = PlTemplateV1.wasmField(tplRef, wasmId);
      tx.createField(fld, "Input");
      tx.setField(fld, _creator(wasm, WasmRenderer, sources));
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
