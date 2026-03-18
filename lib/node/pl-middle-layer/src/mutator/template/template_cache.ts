import { createHash, type Hash } from "node:crypto";
import type {
  AnyRef,
  AnyResourceRef,
  PlClient,
  PlTransaction,
  ResourceId,
} from "@milaboratories/pl-client";
import {
  ensureResourceIdNotNull,
  field,
  resourceType,
  toGlobalResourceId,
} from "@milaboratories/pl-client";
import {
  parseTemplate,
  PlTemplateLibV1,
  PlTemplateOverrideV1,
  PlTemplateSoftwareV1,
  PlTemplateV1,
} from "@milaboratories/pl-model-backend";
import type {
  CompiledTemplateV3,
  TemplateData,
  TemplateDataV3,
  TemplateLibData,
  TemplateLibDataV3,
  TemplateSoftwareData,
  TemplateSoftwareDataV3,
} from "@milaboratories/pl-model-backend";
import { notEmpty } from "@milaboratories/ts-helpers";
import type { BlockPackSpecPrepared } from "../../model";
import type { TemplateSpecPrepared } from "../../model/template_spec";

export const TemplateCacheType = resourceType("TemplateCache", "1");

export const TemplateCacheFieldName = "__templateCache";
const BATCH_SIZE = 50;
const GC_ACCESS_THRESHOLD = 50;
const GC_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ACCESS_COUNT_KEY = "_accessCount";
const ACCESS_KEY_PREFIX = "access_";

// ─── Tree node abstraction ───────────────────────────────────────────────────

interface CacheableNode {
  /** SHA-256 content hash (includes all descendant content) */
  hash: string;
  /** Creates this node's resource in a transaction.
   *  childRefs maps child hash → already-resolved ResourceRef or ResourceId */
  create: (tx: PlTransaction, childRefs: ReadonlyMap<string, AnyRef>) => AnyResourceRef;
  /** Hashes of direct child nodes this node depends on */
  childHashes: string[];
}

// ─── Hash computation helpers ────────────────────────────────────────────────

function sortedEntries<T>(obj: Record<string, T>): [string, T][] {
  const entries = Object.entries(obj);
  entries.sort((a, b) => (a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1));
  return entries;
}

// V2 hash helpers

function hashLibV2(lib: TemplateLibData, h: Hash): void {
  h.update(PlTemplateLibV1.type.name)
    .update(PlTemplateLibV1.type.version)
    .update(lib.name)
    .update(lib.version)
    .update(lib.src);
}

function hashSoftwareV2(sw: TemplateSoftwareData, h: Hash): void {
  h.update(PlTemplateSoftwareV1.type.name)
    .update(PlTemplateSoftwareV1.type.version)
    .update(sw.name)
    .update(sw.version)
    .update(sw.src);
}

function hashTemplateV2(tpl: TemplateData, h: Hash): void {
  h.update(PlTemplateV1.type.name)
    .update(PlTemplateV1.type.version)
    .update(tpl.hashOverride ?? "no-override")
    .update(tpl.name)
    .update(tpl.version)
    .update(tpl.src);

  for (const [libId, lib] of sortedEntries(tpl.libs ?? {})) {
    h.update("lib:" + libId);
    hashLibV2(lib, h);
  }
  for (const [swId, sw] of sortedEntries(tpl.software ?? {})) {
    h.update("soft:" + swId);
    hashSoftwareV2(sw, h);
  }
  for (const [swId, sw] of sortedEntries(tpl.assets ?? {})) {
    h.update("asset:" + swId);
    hashSoftwareV2(sw, h);
  }
  for (const [tplId, sub] of sortedEntries(tpl.templates ?? {})) {
    h.update("tpl:" + tplId);
    hashTemplateV2(sub, h);
  }
}

function computeHashV2<T>(data: T, hashFn: (d: T, h: Hash) => void): string {
  const h = createHash("sha256");
  hashFn(data, h);
  return h.digest("hex");
}

// V3 hash helpers

function getSourceCode(name: string, sources: Record<string, string>, sourceHash: string): string {
  return notEmpty(
    sources[sourceHash],
    `trying to get "${name}" source: sources map doesn't contain source hash ${sourceHash}`,
  );
}

function hashLibV3(lib: TemplateLibDataV3, h: Hash, sources: Record<string, string>): void {
  h.update(PlTemplateLibV1.type.name)
    .update(PlTemplateLibV1.type.version)
    .update(lib.name)
    .update(lib.version)
    .update(getSourceCode(lib.name, sources, lib.sourceHash));
}

function hashSoftwareV3(
  sw: TemplateSoftwareDataV3,
  h: Hash,
  sources: Record<string, string>,
): void {
  h.update(PlTemplateSoftwareV1.type.name)
    .update(PlTemplateSoftwareV1.type.version)
    .update(sw.name)
    .update(sw.version)
    .update(getSourceCode(sw.name, sources, sw.sourceHash));
}

function hashTemplateV3(tpl: TemplateDataV3, h: Hash, sources: Record<string, string>): void {
  h.update(PlTemplateV1.type.name)
    .update(PlTemplateV1.type.version)
    .update(tpl.hashOverride ?? "no-override")
    .update(tpl.name)
    .update(tpl.version)
    .update(getSourceCode(tpl.name, sources, tpl.sourceHash));

  for (const [libId, lib] of sortedEntries(tpl.libs ?? {})) {
    h.update("lib:" + libId);
    hashLibV3(lib, h, sources);
  }
  for (const [swId, sw] of sortedEntries(tpl.software ?? {})) {
    h.update("soft:" + swId);
    hashSoftwareV3(sw, h, sources);
  }
  for (const [swId, sw] of sortedEntries(tpl.assets ?? {})) {
    h.update("asset:" + swId);
    hashSoftwareV3(sw, h, sources);
  }
  for (const [tplId, sub] of sortedEntries(tpl.templates ?? {})) {
    h.update("tpl:" + tplId);
    hashTemplateV3(sub, h, sources);
  }
}

function computeHashV3<T>(
  data: T,
  hashFn: (d: T, h: Hash, s: Record<string, string>) => void,
  sources: Record<string, string>,
): string {
  const h = createHash("sha256");
  hashFn(data, h, sources);
  return h.digest("hex");
}

// ─── Tree flattening ─────────────────────────────────────────────────────────

function flattenV2Tree(data: TemplateData): CacheableNode[] {
  const nodes: CacheableNode[] = [];
  const seen = new Set<string>();

  function processLib(lib: TemplateLibData): string {
    const hash = computeHashV2(lib, hashLibV2);
    if (!seen.has(hash)) {
      seen.add(hash);
      nodes.push({
        hash,
        create: (tx) =>
          tx.createValue(
            PlTemplateLibV1.type,
            JSON.stringify(PlTemplateLibV1.fromV2Data(lib).data),
          ),
        childHashes: [],
      });
    }
    return hash;
  }

  function processSoftware(sw: TemplateSoftwareData): string {
    const hash = computeHashV2(sw, hashSoftwareV2);
    if (!seen.has(hash)) {
      seen.add(hash);
      nodes.push({
        hash,
        create: (tx) => {
          const swData = PlTemplateSoftwareV1.fromV2Data(sw);
          const ref = tx.createStruct(PlTemplateSoftwareV1.type, swData.data);
          tx.setKValue(ref, PlTemplateSoftwareV1.metaNameKey, JSON.stringify(swData.name));
          tx.lock(ref);
          return ref;
        },
        childHashes: [],
      });
    }
    return hash;
  }

  function processTemplate(tpl: TemplateData): string {
    const hash = computeHashV2(tpl, hashTemplateV2);
    if (seen.has(hash)) return hash;

    // Process children first (topological order)
    const childHashes: string[] = [];
    const children: { fieldName: string; hash: string }[] = [];

    for (const [libId, lib] of Object.entries(tpl.libs ?? {})) {
      const h = processLib(lib);
      childHashes.push(h);
      children.push({ fieldName: `${PlTemplateV1.libPrefix}/${libId}`, hash: h });
    }
    for (const [swId, sw] of Object.entries(tpl.software ?? {})) {
      const h = processSoftware(sw);
      childHashes.push(h);
      children.push({ fieldName: `${PlTemplateV1.softPrefix}/${swId}`, hash: h });
    }
    for (const [swId, sw] of Object.entries(tpl.assets ?? {})) {
      const h = processSoftware(sw);
      childHashes.push(h);
      children.push({ fieldName: `${PlTemplateV1.softPrefix}/${swId}`, hash: h });
    }
    for (const [tplId, sub] of Object.entries(tpl.templates ?? {})) {
      const h = processTemplate(sub);
      childHashes.push(h);
      children.push({ fieldName: `${PlTemplateV1.tplPrefix}/${tplId}`, hash: h });
    }

    seen.add(hash);
    nodes.push({
      hash,
      create: (tx, childRefs) => {
        const tplRef = tx.createStruct(
          PlTemplateV1.type,
          JSON.stringify(PlTemplateV1.fromV2Data(tpl).data),
        );
        for (const child of children) {
          const fld = field(tplRef, child.fieldName);
          tx.createField(fld, "Input");
          tx.setField(fld, notEmpty(childRefs.get(child.hash), `missing child ref ${child.hash}`));
        }
        tx.lock(tplRef);

        if (!tpl.hashOverride) return tplRef;

        const overrideRef = tx.createStruct(
          PlTemplateOverrideV1.type,
          JSON.stringify(PlTemplateOverrideV1.fromV2Data(tpl)),
        );
        const overrideFld = PlTemplateOverrideV1.tplField(overrideRef);
        tx.createField(overrideFld, "Service");
        tx.setField(overrideFld, tplRef);
        tx.lock(overrideRef);
        return overrideRef;
      },
      childHashes,
    });

    return hash;
  }

  processTemplate(data);
  return nodes;
}

function flattenV3Tree(data: CompiledTemplateV3): CacheableNode[] {
  const nodes: CacheableNode[] = [];
  const seen = new Set<string>();
  const sources = data.hashToSource;

  function processLib(lib: TemplateLibDataV3): string {
    const hash = computeHashV3(lib, hashLibV3, sources);
    if (!seen.has(hash)) {
      seen.add(hash);
      nodes.push({
        hash,
        create: (tx) =>
          tx.createValue(
            PlTemplateLibV1.type,
            JSON.stringify(
              PlTemplateLibV1.fromV3Data(lib, getSourceCode(lib.name, sources, lib.sourceHash))
                .data,
            ),
          ),
        childHashes: [],
      });
    }
    return hash;
  }

  function processSoftware(sw: TemplateSoftwareDataV3): string {
    const hash = computeHashV3(sw, hashSoftwareV3, sources);
    if (!seen.has(hash)) {
      seen.add(hash);
      nodes.push({
        hash,
        create: (tx) => {
          const swData = PlTemplateSoftwareV1.fromV3Data(
            sw,
            getSourceCode(sw.name, sources, sw.sourceHash),
          );
          const ref = tx.createStruct(PlTemplateSoftwareV1.type, swData.data);
          tx.setKValue(ref, PlTemplateSoftwareV1.metaNameKey, JSON.stringify(swData.name));
          tx.lock(ref);
          return ref;
        },
        childHashes: [],
      });
    }
    return hash;
  }

  function processTemplate(tpl: TemplateDataV3): string {
    const hash = computeHashV3(tpl, hashTemplateV3, sources);
    if (seen.has(hash)) return hash;

    const childHashes: string[] = [];
    const children: { fieldName: string; hash: string }[] = [];

    for (const [libId, lib] of Object.entries(tpl.libs ?? {})) {
      const h = processLib(lib);
      childHashes.push(h);
      children.push({ fieldName: `${PlTemplateV1.libPrefix}/${libId}`, hash: h });
    }
    for (const [swId, sw] of Object.entries(tpl.software ?? {})) {
      const h = processSoftware(sw);
      childHashes.push(h);
      children.push({ fieldName: `${PlTemplateV1.softPrefix}/${swId}`, hash: h });
    }
    for (const [swId, sw] of Object.entries(tpl.assets ?? {})) {
      const h = processSoftware(sw);
      childHashes.push(h);
      children.push({ fieldName: `${PlTemplateV1.softPrefix}/${swId}`, hash: h });
    }
    for (const [tplId, sub] of Object.entries(tpl.templates ?? {})) {
      const h = processTemplate(sub);
      childHashes.push(h);
      children.push({ fieldName: `${PlTemplateV1.tplPrefix}/${tplId}`, hash: h });
    }

    seen.add(hash);
    nodes.push({
      hash,
      create: (tx, childRefs) => {
        const sourceCode = getSourceCode(tpl.name, sources, tpl.sourceHash);
        const tplRef = tx.createStruct(
          PlTemplateV1.type,
          JSON.stringify(PlTemplateV1.fromV3Data(tpl, sourceCode).data),
        );
        for (const child of children) {
          const fld = field(tplRef, child.fieldName);
          tx.createField(fld, "Input");
          tx.setField(fld, notEmpty(childRefs.get(child.hash), `missing child ref ${child.hash}`));
        }
        tx.lock(tplRef);

        if (!tpl.hashOverride) return tplRef;

        const overrideRef = tx.createStruct(
          PlTemplateOverrideV1.type,
          JSON.stringify(PlTemplateOverrideV1.fromV3Data(tpl)),
        );
        const overrideFld = PlTemplateOverrideV1.tplField(overrideRef);
        tx.createField(overrideFld, "Service");
        tx.setField(overrideFld, tplRef);
        tx.lock(overrideRef);
        return overrideRef;
      },
      childHashes,
    });

    return hash;
  }

  processTemplate(data.template);
  return nodes;
}

/** Flatten template tree into a topologically ordered list of cacheable nodes (leaves first). */
export function flattenTemplateTree(data: TemplateData | CompiledTemplateV3): CacheableNode[] {
  if (data.type === "pl.tengo-template.v2") {
    return flattenV2Tree(data);
  } else {
    return flattenV3Tree(data);
  }
}

// ─── Cache operations ────────────────────────────────────────────────────────

/** Find or create the TemplateCache/1 resource on user root. */
export async function getOrCreateTemplateCache(pl: PlClient): Promise<ResourceId> {
  // Try read-only check first to avoid unnecessary write tx
  const existing = await pl.withReadTx("templateCache:check", async (tx) => {
    const fd = await tx.getFieldIfExists(field(pl.clientRoot, TemplateCacheFieldName));
    return fd ? ensureResourceIdNotNull(fd.value) : undefined;
  });
  if (existing) return existing;

  return pl.withWriteTx("templateCache:init", async (tx) => {
    // Double-check inside write tx (another instance may have created it)
    const fd = await tx.getFieldIfExists(field(pl.clientRoot, TemplateCacheFieldName));
    if (fd) return ensureResourceIdNotNull(fd.value);

    const cache = tx.createStruct(TemplateCacheType);
    tx.createField(field(pl.clientRoot, TemplateCacheFieldName), "Dynamic", cache);
    tx.lock(cache);
    await tx.commit();
    return await cache.globalId;
  });
}

/** Remove the template cache from user root. */
export async function dropTemplateCache(pl: PlClient): Promise<void> {
  await pl.withWriteTx("templateCache:drop", async (tx) => {
    const cacheField = field(pl.clientRoot, TemplateCacheFieldName);
    const fd = await tx.getFieldIfExists(cacheField);
    if (fd) {
      tx.removeField(cacheField);
      await tx.commit();
    }
  });
}

// ─── GC ──────────────────────────────────────────────────────────────────────

async function runGcIfNeeded(tx: PlTransaction, cacheRid: ResourceId): Promise<void> {
  const countStr = await tx.getKValueStringIfExists(cacheRid, ACCESS_COUNT_KEY);
  const accessCount = countStr ? parseInt(countStr, 10) : 0;
  if (accessCount < GC_ACCESS_THRESHOLD) return;

  const kvs = await tx.listKeyValuesString(cacheRid);
  const now = Date.now();

  for (const { key, value } of kvs) {
    if (!key.startsWith(ACCESS_KEY_PREFIX)) continue;
    const ts = parseInt(value, 10);
    if (now - ts > GC_MAX_AGE_MS) {
      const hash = key.slice(ACCESS_KEY_PREFIX.length);
      tx.removeField(field(cacheRid, hash));
      tx.deleteKValue(cacheRid, key);
    }
  }

  tx.setKValue(cacheRid, ACCESS_COUNT_KEY, "0");
}

// ─── Batched materialization ─────────────────────────────────────────────────

/**
 * Materialize a template tree via the cache.
 * Manages its own transactions internally — do NOT call inside an existing tx.
 *
 * @returns concrete ResourceId of the root template
 */
export async function loadTemplateCached(
  pl: PlClient,
  spec: TemplateSpecPrepared,
  options?: { cacheResourceId?: ResourceId },
): Promise<ResourceId> {
  // Parse to data if needed
  let tplData: TemplateData | CompiledTemplateV3;
  switch (spec.type) {
    case "explicit":
      tplData = parseTemplate(spec.content);
      break;
    case "prepared":
      tplData = spec.data;
      break;
    case "cached":
      return spec.resourceId;
    case "from-registry":
      throw new Error(
        "loadTemplateCached does not support from-registry specs; use loadTemplate instead",
      );
    default: {
      const _: never = spec;
      throw new Error(`unexpected spec type: ${(_ as any).type}`);
    }
  }

  // Flatten to ordered nodes
  const nodes = flattenTemplateTree(tplData);
  if (nodes.length === 0) throw new Error("template tree produced no nodes");

  const rootHash = nodes[nodes.length - 1].hash;

  // Resolve or create cache resource
  const cacheRid = options?.cacheResourceId ?? (await getOrCreateTemplateCache(pl));

  // Resolved IDs from all batches
  const resolvedIds = new Map<string, ResourceId>();

  // Split into batches
  const batches: CacheableNode[][] = [];
  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    batches.push(nodes.slice(i, i + BATCH_SIZE));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const isFirstBatch = batchIdx === 0;

    const batchResult = await pl.withWriteTx("templateCache:materialize", async (tx) => {
      // ── First batch: happy path + GC ──
      if (isFirstBatch) {
        // Happy path: check if root is already cached
        if (await tx.fieldExists(field(cacheRid, rootHash))) {
          const rootFd = await tx.getField(field(cacheRid, rootHash));
          const rootRid = ensureResourceIdNotNull(rootFd.value);
          // Update access tracking
          const now = Date.now().toString();
          tx.setKValue(cacheRid, ACCESS_KEY_PREFIX + rootHash, now);
          const countStr = await tx.getKValueStringIfExists(cacheRid, ACCESS_COUNT_KEY);
          const count = countStr ? parseInt(countStr, 10) : 0;
          tx.setKValue(cacheRid, ACCESS_COUNT_KEY, (count + 1).toString());
          await tx.commit();
          return { done: true as const, rootId: rootRid };
        }

        // Run GC if threshold exceeded
        await runGcIfNeeded(tx, cacheRid);
      }

      // ── Parallel cache checks for all nodes in this batch ──
      const existsResults = await Promise.all(
        batch.map((node) => tx.fieldExists(field(cacheRid, node.hash))),
      );

      // Resolve existing entries
      const toCreate: CacheableNode[] = [];
      const fieldReads: Promise<void>[] = [];
      for (let i = 0; i < batch.length; i++) {
        const node = batch[i];
        if (resolvedIds.has(node.hash)) continue; // Already resolved from a prior batch
        if (existsResults[i]) {
          fieldReads.push(
            tx.getField(field(cacheRid, node.hash)).then((fd) => {
              resolvedIds.set(node.hash, ensureResourceIdNotNull(fd.value));
            }),
          );
        } else {
          toCreate.push(node);
        }
      }
      await Promise.all(fieldReads);

      // ── Create missing nodes ──
      const newRefs = new Map<string, AnyResourceRef>();
      const now = Date.now().toString();

      for (const node of toCreate) {
        // Build child refs from resolvedIds + newRefs in this batch
        const childRefs = new Map<string, AnyRef>();
        for (const ch of node.childHashes) {
          const resolved = resolvedIds.get(ch);
          if (resolved !== undefined) {
            childRefs.set(ch, resolved);
          } else {
            const batchRef = newRefs.get(ch);
            if (batchRef !== undefined) {
              childRefs.set(ch, batchRef);
            } else {
              throw new Error(`BUG: child ${ch} not resolved and not in current batch`);
            }
          }
        }

        const ref = node.create(tx, childRefs);
        newRefs.set(node.hash, ref);

        // Add to cache
        tx.createField(field(cacheRid, node.hash), "Dynamic", ref);

        // Access tracking
        tx.setKValue(cacheRid, ACCESS_KEY_PREFIX + node.hash, now);
      }

      // Also update access tracking for cache-hit nodes in this batch
      for (let i = 0; i < batch.length; i++) {
        if (existsResults[i] && !toCreate.includes(batch[i])) {
          tx.setKValue(cacheRid, ACCESS_KEY_PREFIX + batch[i].hash, now);
        }
      }

      // Increment global access count (once per loadTemplateCached call, in first batch)
      if (isFirstBatch) {
        const countStr = await tx.getKValueStringIfExists(cacheRid, ACCESS_COUNT_KEY);
        const count = countStr ? parseInt(countStr, 10) : 0;
        tx.setKValue(cacheRid, ACCESS_COUNT_KEY, (count + 1).toString());
      }

      // Commit if we created resources or wrote KV metadata (first batch always writes KV)
      if (toCreate.length > 0 || isFirstBatch) {
        await tx.commit();
      }

      // Resolve new refs to global IDs (must happen after commit)
      for (const [hash, ref] of newRefs) {
        resolvedIds.set(hash, await toGlobalResourceId(ref));
      }

      return { done: false as const };
    });

    if (batchResult.done) {
      return batchResult.rootId;
    }
  }

  const rootId = resolvedIds.get(rootHash);
  if (!rootId) throw new Error("BUG: root hash not resolved after all batches");
  return rootId;
}

// ─── Caller helper ───────────────────────────────────────────────────────────

/**
 * Pre-materialize a block pack's template via cache.
 * Returns a copy of the spec with the template replaced by a cached reference.
 * If the template is already cached, returns the spec unchanged.
 */
export async function cacheBlockPackTemplate(
  pl: PlClient,
  spec: BlockPackSpecPrepared,
  options?: { cacheResourceId?: ResourceId },
): Promise<BlockPackSpecPrepared> {
  if (spec.template.type === "cached") return spec;

  const resourceId = await loadTemplateCached(pl, spec.template, options);
  return {
    ...spec,
    template: { type: "cached", resourceId },
  };
}
