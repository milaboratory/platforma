import { createHash } from "node:crypto";
import type {
  AnyResourceRef,
  PlClient,
  PlTransaction,
  ResourceId,
  ResourceRef,
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
import { getDebugFlags } from "../../debug";

export const TemplateCacheType = resourceType("TemplateCache", "1");

export const TemplateCacheFieldName = "__templateCache";
const BATCH_SIZE = 50;
/** @internal exported for testing */
export const GC_ACCESS_THRESHOLD = 50;
const GC_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** @internal exported for testing */
export const ACCESS_COUNT_KEY = "_accessCount";
/** @internal exported for testing */
export const ACCESS_KEY_PREFIX = "access_";

// ─── Stats ───────────────────────────────────────────────────────────────────

export type TemplateCacheStat = {
  totalMs: number;
  flattenMs: number;
  cacheInitMs: number;
  materializeMs: number;
  totalNodes: number;
  cacheHits: number;
  cacheMisses: number;
  batchCount: number;
  happyPath: boolean;
  gcTriggered: boolean;
  retries: number;
  templateFormat: string;
};

function initialStat(): TemplateCacheStat {
  return {
    totalMs: 0,
    flattenMs: 0,
    cacheInitMs: 0,
    materializeMs: 0,
    totalNodes: 0,
    cacheHits: 0,
    cacheMisses: 0,
    batchCount: 0,
    happyPath: false,
    gcTriggered: false,
    retries: 0,
    templateFormat: "",
  };
}

// ─── Tree node abstraction ───────────────────────────────────────────────────

interface CacheableNode {
  /** SHA-256 content hash (includes all descendant content) */
  hash: string;
  /** Creates this node's resource in a transaction.
   *  childRefs maps child hash → already-resolved ResourceRef or ResourceId */
  create: (tx: PlTransaction, childRefs: ReadonlyMap<string, AnyResourceRef>) => ResourceRef;
  /** Hashes of direct child nodes this node depends on */
  childHashes: string[];
}

// ─── Hash computation helpers ────────────────────────────────────────────────

function getSourceCode(name: string, sources: Record<string, string>, sourceHash: string): string {
  return notEmpty(
    sources[sourceHash],
    `trying to get "${name}" source: sources map doesn't contain source hash ${sourceHash}`,
  );
}

/**
 * Bottom-up hash composition: each node hashes its OWN content + child hash STRINGS.
 * This means each unique node is hashed exactly once → O(n) instead of O(n * depth).
 */

// V2 leaf hashes (libs, software — no children)

function hashLibV2(lib: TemplateLibData): string {
  return createHash("sha256")
    .update(PlTemplateLibV1.type.name)
    .update(PlTemplateLibV1.type.version)
    .update(lib.name)
    .update(lib.version)
    .update(lib.src)
    .digest("hex");
}

function hashSoftwareV2(sw: TemplateSoftwareData): string {
  return createHash("sha256")
    .update(PlTemplateSoftwareV1.type.name)
    .update(PlTemplateSoftwareV1.type.version)
    .update(sw.name)
    .update(sw.version)
    .update(sw.src)
    .digest("hex");
}

// V3 leaf hashes — use sourceHash directly instead of resolving source content

function hashLibV3(lib: TemplateLibDataV3): string {
  return createHash("sha256")
    .update(PlTemplateLibV1.type.name)
    .update(PlTemplateLibV1.type.version)
    .update(lib.name)
    .update(lib.version)
    .update(lib.sourceHash)
    .digest("hex");
}

function hashSoftwareV3(sw: TemplateSoftwareDataV3): string {
  return createHash("sha256")
    .update(PlTemplateSoftwareV1.type.name)
    .update(PlTemplateSoftwareV1.type.version)
    .update(sw.name)
    .update(sw.version)
    .update(sw.sourceHash)
    .digest("hex");
}

// ─── Tree flattening ─────────────────────────────────────────────────────────

function flattenV2Tree(data: TemplateData): CacheableNode[] {
  const nodes: CacheableNode[] = [];
  const seen = new Set<string>();

  function processLib(lib: TemplateLibData): string {
    const hash = hashLibV2(lib);
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
    const hash = hashSoftwareV2(sw);
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
    // Process children first (bottom-up) — their hashes are computed before ours
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

    // Compose hash from own content + child hash strings (NOT child content)
    const h = createHash("sha256")
      .update(PlTemplateV1.type.name)
      .update(PlTemplateV1.type.version)
      .update(tpl.hashOverride ?? "no-override")
      .update(tpl.name)
      .update(tpl.version)
      .update(tpl.src);
    for (const child of children) {
      h.update("child:" + child.fieldName + ":" + child.hash);
    }
    const hash = h.digest("hex");

    if (seen.has(hash)) return hash;
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
    const hash = hashLibV3(lib);
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
    const hash = hashSoftwareV3(sw);
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
    // Process children first (bottom-up)
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

    // Compose hash from own content + child hash strings (NOT child content).
    // Uses sourceHash directly — it already uniquely identifies the source.
    const h = createHash("sha256")
      .update(PlTemplateV1.type.name)
      .update(PlTemplateV1.type.version)
      .update(tpl.hashOverride ?? "no-override")
      .update(tpl.name)
      .update(tpl.version)
      .update(tpl.sourceHash);
    for (const child of children) {
      h.update("child:" + child.fieldName + ":" + child.hash);
    }
    const hash = h.digest("hex");

    if (seen.has(hash)) return hash;
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

/** In-memory cache for the TemplateCache ResourceId per PlClient instance. */
const cacheRidMap = new WeakMap<PlClient, ResourceId>();

/** Clear the in-memory cacheRid entry (call on errors referencing the cache resource). */
export function invalidateTemplateCacheId(pl: PlClient): void {
  cacheRidMap.delete(pl);
}

/** Find or create the TemplateCache/1 resource on user root. */
export async function getOrCreateTemplateCache(pl: PlClient): Promise<ResourceId> {
  // Check in-memory cache first (0ms after first call)
  const cached = cacheRidMap.get(pl);
  if (cached !== undefined) return cached;

  // Try read-only check
  const existing = await pl.withReadTx("templateCache:check", async (tx) => {
    const fd = await tx.getFieldIfExists(field(pl.clientRoot, TemplateCacheFieldName));
    return fd ? ensureResourceIdNotNull(fd.value) : undefined;
  });
  if (existing) {
    cacheRidMap.set(pl, existing);
    return existing;
  }

  const result = await pl.withWriteTx("templateCache:init", async (tx) => {
    // Double-check inside write tx (another instance may have created it)
    const fd = await tx.getFieldIfExists(field(pl.clientRoot, TemplateCacheFieldName));
    if (fd) return ensureResourceIdNotNull(fd.value);

    const cache = tx.createStruct(TemplateCacheType);
    tx.createField(field(pl.clientRoot, TemplateCacheFieldName), "Dynamic", cache);
    tx.lock(cache);
    await tx.commit();
    return await cache.globalId;
  });
  cacheRidMap.set(pl, result);
  return result;
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
  invalidateTemplateCacheId(pl);
}

// ─── GC ──────────────────────────────────────────────────────────────────────

/** @returns true if GC ran (counter was reset to 0) */
async function runGcIfNeeded(tx: PlTransaction, cacheRid: ResourceId): Promise<boolean> {
  const countStr = await tx.getKValueStringIfExists(cacheRid, ACCESS_COUNT_KEY);
  const accessCount = countStr ? parseInt(countStr, 10) : 0;
  if (accessCount < GC_ACCESS_THRESHOLD) return false;

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
  return true;
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
  const stat = initialStat();
  const t0 = performance.now();

  try {
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

    stat.templateFormat = tplData.type;

    // Flatten to ordered nodes
    const tFlatten = performance.now();
    const nodes = flattenTemplateTree(tplData);
    stat.flattenMs = performance.now() - tFlatten;
    if (nodes.length === 0) throw new Error("template tree produced no nodes");

    stat.totalNodes = nodes.length;
    const rootHash = nodes[nodes.length - 1].hash;

    // Resolve or create cache resource
    const tCacheInit = performance.now();
    const cacheRid = options?.cacheResourceId ?? (await getOrCreateTemplateCache(pl));
    stat.cacheInitMs = performance.now() - tCacheInit;

    // Split into batches
    const batches: CacheableNode[][] = [];
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      batches.push(nodes.slice(i, i + BATCH_SIZE));
    }
    stat.batchCount = batches.length;

    // Retry loop: if a batch commit fails because a previously-cached resource
    // was GC'd between batches, restart the entire materialization from scratch.
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const tMat = performance.now();
        const result = await materializeBatches(pl, cacheRid, rootHash, batches, stat);
        stat.materializeMs = performance.now() - tMat;
        stat.retries = attempt;
        return result;
      } catch (e) {
        if (attempt === MAX_RETRIES - 1) throw e;
        // Retry from scratch — previous batch results may reference GC'd resources
        stat.cacheHits = 0;
        stat.cacheMisses = 0;
      }
    }

    throw new Error("BUG: unreachable");
  } finally {
    stat.totalMs = performance.now() - t0;
    if (getDebugFlags().logTemplateCacheStat) {
      console.log(`[templateCache] ${JSON.stringify(stat)}`);
    }
  }
}

async function materializeBatches(
  pl: PlClient,
  cacheRid: ResourceId,
  rootHash: string,
  batches: CacheableNode[][],
  stat: TemplateCacheStat,
): Promise<ResourceId> {
  // Resolved IDs from all batches (global ResourceIds only)
  const resolvedIds = new Map<string, ResourceId>();

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const isFirstBatch = batchIdx === 0;

    const batchResult = await pl.withWriteTx("templateCache:materialize", async (tx) => {
      let gcRan = false;

      // ── First batch: happy path + GC ──
      if (isFirstBatch) {
        // Happy path: parallel check for root existence + access count (2 ops, 1 roundtrip)
        // NOTE: getFieldIfExists can't be used in Promise.all within write tx — the NOT_FOUND
        // error from getField leaks through the shared PromiseTracker to other parallel ops.
        // fieldExists returns a boolean and never throws NOT_FOUND.
        const [rootExists, countStr] = await Promise.all([
          tx.fieldExists(field(cacheRid, rootHash)),
          tx.getKValueStringIfExists(cacheRid, ACCESS_COUNT_KEY),
        ]);

        if (rootExists) {
          // Root confirmed to exist — safe to getField (1 more roundtrip)
          const rootFd = await tx.getField(field(cacheRid, rootHash));
          const rootRid = ensureResourceIdNotNull(rootFd.value);
          // Update access tracking (fire-and-forget writes, only commit awaited)
          const now = Date.now().toString();
          tx.setKValue(cacheRid, ACCESS_KEY_PREFIX + rootHash, now);
          const count = countStr ? parseInt(countStr, 10) : 0;
          tx.setKValue(cacheRid, ACCESS_COUNT_KEY, (count + 1).toString());
          await tx.commit();
          stat.happyPath = true;
          stat.cacheHits = stat.totalNodes;
          return { done: true as const, rootId: rootRid };
        }

        // Run GC if threshold exceeded
        gcRan = await runGcIfNeeded(tx, cacheRid);
        if (gcRan) stat.gcTriggered = true;
      }

      // ── Parallel cache checks for all nodes in this batch ──
      // fieldExists in parallel (1 roundtrip), then getField for hits (1 roundtrip)
      const existsResults = await Promise.all(
        batch.map((node) =>
          resolvedIds.has(node.hash)
            ? Promise.resolve(false)
            : tx.fieldExists(field(cacheRid, node.hash)),
        ),
      );

      // Resolve existing entries — read values for cache hits in parallel
      const toCreate: CacheableNode[] = [];
      const cacheHitHashes: string[] = [];
      const fieldReads: Promise<void>[] = [];
      for (let i = 0; i < batch.length; i++) {
        const node = batch[i];
        if (resolvedIds.has(node.hash)) continue;
        if (existsResults[i]) {
          fieldReads.push(
            tx.getField(field(cacheRid, node.hash)).then((fd) => {
              resolvedIds.set(node.hash, ensureResourceIdNotNull(fd.value));
            }),
          );
          cacheHitHashes.push(node.hash);
          stat.cacheHits++;
        } else {
          toCreate.push(node);
          stat.cacheMisses++;
        }
      }
      await Promise.all(fieldReads);

      // ── Create missing nodes ──
      const newRefs = new Map<string, ResourceRef>();
      const now = Date.now().toString();
      let hasWrites = false;

      for (const node of toCreate) {
        // Build child refs from resolvedIds + newRefs in this batch
        const childRefs = new Map<string, AnyResourceRef>();
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
        hasWrites = true;
      }

      // Also update access tracking for cache-hit nodes in this batch
      for (const hitHash of cacheHitHashes) {
        tx.setKValue(cacheRid, ACCESS_KEY_PREFIX + hitHash, now);
        hasWrites = true;
      }

      // Increment global access count (once per loadTemplateCached call, in first batch)
      if (isFirstBatch) {
        // If GC just ran, counter was reset to "0" in this tx — use 0 directly
        // to avoid reading the stale committed value
        const prevCount = gcRan
          ? 0
          : parseInt((await tx.getKValueStringIfExists(cacheRid, ACCESS_COUNT_KEY)) ?? "0", 10);
        tx.setKValue(cacheRid, ACCESS_COUNT_KEY, (prevCount + 1).toString());
        hasWrites = true;
      }

      // Commit if we have any pending writes
      if (hasWrites) {
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
