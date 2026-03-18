import {
  ensureResourceIdNotNull,
  field,
  isNotNullResourceId,
  poll,
  TestHelpers,
  toGlobalResourceId,
} from "@milaboratories/pl-client";
import type { AnyResourceRef } from "@milaboratories/pl-client";
import { describe, expect, test } from "vitest";
import { TplSpecEnterExplicit, TplSpecSumExplicit } from "../../test/known_templates";
import {
  ExplicitTemplateEnterNumbers,
  ExplicitTemplateSumNumbers,
} from "../../test/explicit_templates";
import { loadTemplate } from "./template_loading";
import {
  ACCESS_COUNT_KEY,
  ACCESS_KEY_PREFIX,
  cacheBlockPackTemplate,
  dropTemplateCache,
  flattenTemplateTree,
  GC_ACCESS_THRESHOLD,
  getOrCreateTemplateCache,
  loadTemplateCached,
  TemplateCacheType,
} from "./template_cache";
import { parseTemplate } from "@milaboratories/pl-model-backend";
import type { BlockPackSpecPrepared } from "../../model";
import fs from "node:fs";
import path from "node:path";

function createTestCacheInTx(pl: Parameters<Parameters<typeof TestHelpers.withTempRoot>[0]>[0]) {
  return pl.withWriteTx("createTestCache", async (tx) => {
    const cache = tx.createStruct(TemplateCacheType);
    // Attach to user root so it doesn't get GC'd
    tx.createField(field(pl.clientRoot, "__testCache"), "Dynamic", cache);
    tx.lock(cache);
    await tx.commit();
    return await cache.globalId;
  });
}

// Load V3 template from the enter-numbers-v3 block
const V3TemplatePath = path.resolve(
  __dirname,
  "../../../../../../etc/blocks/enter-numbers-v3/block/block-pack/main.plj.gz",
);
const V3TemplateContent = fs.existsSync(V3TemplatePath)
  ? fs.readFileSync(V3TemplatePath)
  : undefined;

// ─── flattenTemplateTree ─────────────────────────────────────────────────────

describe("flattenTemplateTree", () => {
  test("produces nodes in topological order for V2 template", () => {
    const data = parseTemplate(ExplicitTemplateEnterNumbers);
    const nodes = flattenTemplateTree(data);
    expect(nodes.length).toBeGreaterThan(0);

    // All hashes are unique
    const hashes = nodes.map((n) => n.hash);
    expect(new Set(hashes).size).toBe(hashes.length);

    // Every child hash references a node that appears earlier in the list
    const seenHashes = new Set<string>();
    for (const node of nodes) {
      for (const ch of node.childHashes) {
        expect(seenHashes.has(ch)).toBe(true);
      }
      seenHashes.add(node.hash);
    }
  });

  test("deterministic hashes for same content", () => {
    const data = parseTemplate(ExplicitTemplateEnterNumbers);
    const nodes1 = flattenTemplateTree(data);
    const nodes2 = flattenTemplateTree(data);
    expect(nodes1.map((n) => n.hash)).toStrictEqual(nodes2.map((n) => n.hash));
  });

  test("different templates produce different root hashes", () => {
    const dataEnter = parseTemplate(ExplicitTemplateEnterNumbers);
    const dataSum = parseTemplate(ExplicitTemplateSumNumbers);
    const nodesEnter = flattenTemplateTree(dataEnter);
    const nodesSum = flattenTemplateTree(dataSum);
    expect(nodesEnter[nodesEnter.length - 1].hash).not.toBe(nodesSum[nodesSum.length - 1].hash);
  });

  test.skipIf(!V3TemplateContent)("produces nodes in topological order for V3 template", () => {
    const data = parseTemplate(V3TemplateContent!);
    expect(data.type).toBe("pl.tengo-template.v3");
    const nodes = flattenTemplateTree(data);
    expect(nodes.length).toBeGreaterThan(0);

    const seenHashes = new Set<string>();
    for (const node of nodes) {
      for (const ch of node.childHashes) {
        expect(seenHashes.has(ch)).toBe(true);
      }
      seenHashes.add(node.hash);
    }
  });

  test.skipIf(!V3TemplateContent)("V3 hashes are deterministic", () => {
    const data = parseTemplate(V3TemplateContent!);
    const nodes1 = flattenTemplateTree(data);
    const nodes2 = flattenTemplateTree(data);
    expect(nodes1.map((n) => n.hash)).toStrictEqual(nodes2.map((n) => n.hash));
  });
});

// ─── getOrCreateTemplateCache / dropTemplateCache ────────────────────────────

describe("getOrCreateTemplateCache", () => {
  test("creates cache on first call and reuses on second", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const cacheId1 = await getOrCreateTemplateCache(pl);
      const cacheId2 = await getOrCreateTemplateCache(pl);
      expect(cacheId1).toBe(cacheId2);
    });
  });
});

describe("dropTemplateCache", () => {
  test("drops cache and allows recreation", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const cacheId1 = await getOrCreateTemplateCache(pl);
      await dropTemplateCache(pl);
      const cacheId2 = await getOrCreateTemplateCache(pl);
      expect(cacheId1).not.toBe(cacheId2);
    });
  });
});

// ─── loadTemplateCached ──────────────────────────────────────────────────────

describe("loadTemplateCached", () => {
  test("cache miss then cache hit returns same ResourceId", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      const id1 = await loadTemplateCached(pl, TplSpecEnterExplicit, {
        cacheResourceId: testCache,
      });
      const id2 = await loadTemplateCached(pl, TplSpecEnterExplicit, {
        cacheResourceId: testCache,
      });
      expect(id1).toBe(id2);
    });
  }, 15000);

  test("different templates get different ResourceIds", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      const id1 = await loadTemplateCached(pl, TplSpecEnterExplicit, {
        cacheResourceId: testCache,
      });
      const id2 = await loadTemplateCached(pl, TplSpecSumExplicit, {
        cacheResourceId: testCache,
      });
      expect(id1).not.toBe(id2);
    });
  }, 15000);

  test("cached template can be used in a transaction via loadTemplate", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      const templateId = await loadTemplateCached(pl, TplSpecEnterExplicit, {
        cacheResourceId: testCache,
      });

      // Use the cached template in a write transaction
      const resultId = await pl.withWriteTx("useCachedTemplate", async (tx) => {
        const ref = loadTemplate(tx, { type: "cached", resourceId: templateId });
        const holder = field(pl.clientRoot, "test_result");
        tx.createField(holder, "Dynamic", ref);
        await tx.commit();
        return templateId;
      });

      // Verify the field was set correctly
      await pl.withReadTx("verify", async (tx) => {
        const fd = await tx.getField(field(pl.clientRoot, "test_result"));
        expect(ensureResourceIdNotNull(fd.value)).toBe(resultId);
      });
    });
  }, 15000);

  test("cached spec type is passed through without re-caching", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      const id1 = await loadTemplateCached(pl, TplSpecEnterExplicit, {
        cacheResourceId: testCache,
      });
      // Pass cached spec directly
      const id2 = await loadTemplateCached(
        pl,
        { type: "cached", resourceId: id1 },
        { cacheResourceId: testCache },
      );
      expect(id1).toBe(id2);
    });
  }, 10000);

  test("uses lazy cache initialization when no cacheResourceId provided", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const id = await loadTemplateCached(pl, TplSpecEnterExplicit);
      expect(id).toBeDefined();

      const id2 = await loadTemplateCached(pl, TplSpecEnterExplicit);
      expect(id).toBe(id2);
    });
  }, 15000);

  test.skipIf(!V3TemplateContent)(
    "caches V3 template (cache miss then hit)",
    async () => {
      await TestHelpers.withTempRoot(async (pl) => {
        const testCache = await createTestCacheInTx(pl);
        const v3Spec = { type: "explicit" as const, content: V3TemplateContent! };

        const id1 = await loadTemplateCached(pl, v3Spec, { cacheResourceId: testCache });
        const id2 = await loadTemplateCached(pl, v3Spec, { cacheResourceId: testCache });
        expect(id1).toBe(id2);
      });
    },
    15000,
  );
});

// ─── cacheBlockPackTemplate ──────────────────────────────────────────────────

describe("cacheBlockPackTemplate", () => {
  test("replaces prepared template with cached reference", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      const spec: BlockPackSpecPrepared = {
        type: "prepared",
        template: {
          type: "prepared",
          data: parseTemplate(ExplicitTemplateEnterNumbers),
        },
        config: { renderingMode: "Heavy" } as any,
        frontend: { type: "url", url: "http://test" },
        source: { type: "dev-v1", folder: "/test" },
      };

      const cached = await cacheBlockPackTemplate(pl, spec, {
        cacheResourceId: testCache,
      });
      expect(cached.template.type).toBe("cached");
      expect(cached.type).toBe("prepared");
      expect(cached.config).toBe(spec.config);
    });
  }, 15000);

  test("returns already-cached spec unchanged", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      const templateId = await loadTemplateCached(pl, TplSpecEnterExplicit, {
        cacheResourceId: testCache,
      });

      const spec: BlockPackSpecPrepared = {
        type: "prepared",
        template: { type: "cached", resourceId: templateId },
        config: { renderingMode: "Heavy" } as any,
        frontend: { type: "url", url: "http://test" },
        source: { type: "dev-v1", folder: "/test" },
      };

      const result = await cacheBlockPackTemplate(pl, spec, {
        cacheResourceId: testCache,
      });
      expect(result).toBe(spec);
    });
  }, 15000);
});

// ─── Equivalence: cached vs legacy produce identical resources ───────────────

describe("template cache produces equivalent resources", () => {
  test("cached and legacy templates deduplicate to same original (V2)", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      // Cached path
      const cachedId = await loadTemplateCached(pl, TplSpecEnterExplicit, {
        cacheResourceId: testCache,
      });

      // Legacy path (inside a transaction)
      const legacyId = await pl.withWriteTx("legacy", async (tx) => {
        const ref = loadTemplate(tx, TplSpecEnterExplicit);
        const holder = field(pl.clientRoot, "legacy_tpl");
        tx.createField(holder, "Dynamic", ref);
        await tx.commit();
        return await toGlobalResourceId(ref as AnyResourceRef);
      });

      // Wait for both to reach final state
      const [cachedOriginal, legacyOriginal] = await poll(pl, async (a) => {
        const cachedRes = await a.get(cachedId).then((r) => r.final());
        const legacyRes = await a.get(legacyId).then((r) => r.final());
        return [cachedRes.data.originalResourceId, legacyRes.data.originalResourceId] as const;
      });

      // After dedup, both should resolve to the same canonical resource.
      // Either one points to the other, or both point to a common original.
      const resolvedCached = isNotNullResourceId(cachedOriginal) ? cachedOriginal : cachedId;
      const resolvedLegacy = isNotNullResourceId(legacyOriginal) ? legacyOriginal : legacyId;
      expect(resolvedCached).toBe(resolvedLegacy);
    });
  }, 30000);

  test.skipIf(!V3TemplateContent)(
    "cached and legacy templates deduplicate to same original (V3)",
    async () => {
      await TestHelpers.withTempRoot(async (pl) => {
        const testCache = await createTestCacheInTx(pl);
        const v3Spec = { type: "explicit" as const, content: V3TemplateContent! };

        // Cached path
        const cachedId = await loadTemplateCached(pl, v3Spec, { cacheResourceId: testCache });

        // Legacy path
        const legacyId = await pl.withWriteTx("legacy", async (tx) => {
          const ref = loadTemplate(tx, v3Spec);
          const holder = field(pl.clientRoot, "legacy_v3_tpl");
          tx.createField(holder, "Dynamic", ref);
          await tx.commit();
          return await toGlobalResourceId(ref as AnyResourceRef);
        });

        const [cachedOriginal, legacyOriginal] = await poll(pl, async (a) => {
          const cachedRes = await a.get(cachedId).then((r) => r.final());
          const legacyRes = await a.get(legacyId).then((r) => r.final());
          return [cachedRes.data.originalResourceId, legacyRes.data.originalResourceId] as const;
        });

        const resolvedCached = isNotNullResourceId(cachedOriginal) ? cachedOriginal : cachedId;
        const resolvedLegacy = isNotNullResourceId(legacyOriginal) ? legacyOriginal : legacyId;
        expect(resolvedCached).toBe(resolvedLegacy);
      });
    },
    30000,
  );
});

// ─── Shared library dedup ────────────────────────────────────────────────────

describe("shared library dedup", () => {
  test("two different templates sharing a library reuse the same cache entry", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      // Flatten both templates and find common hashes (shared libs)
      const nodesEnter = flattenTemplateTree(parseTemplate(ExplicitTemplateEnterNumbers));
      const nodesSum = flattenTemplateTree(parseTemplate(ExplicitTemplateSumNumbers));
      const enterHashes = new Set(nodesEnter.map((n) => n.hash));
      const sumHashes = new Set(nodesSum.map((n) => n.hash));
      const sharedHashes = [...enterHashes].filter((h) => sumHashes.has(h));

      // Cache both templates
      await loadTemplateCached(pl, TplSpecEnterExplicit, { cacheResourceId: testCache });
      await loadTemplateCached(pl, TplSpecSumExplicit, { cacheResourceId: testCache });

      // Verify shared hashes exist as fields on the cache resource
      if (sharedHashes.length > 0) {
        await pl.withReadTx("checkShared", async (tx) => {
          for (const hash of sharedHashes) {
            const exists = await tx.fieldExists(field(testCache, hash));
            expect(exists).toBe(true);
          }
        });
      }
    });
  }, 15000);
});

// ─── GC ──────────────────────────────────────────────────────────────────────

describe("GC", () => {
  test("evicts stale entries when access count exceeds threshold", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      // Cache enter-numbers template
      await loadTemplateCached(pl, TplSpecEnterExplicit, { cacheResourceId: testCache });

      // Find hashes unique to enter-numbers (not shared with sum-numbers)
      const enterHashes = new Set(
        flattenTemplateTree(parseTemplate(ExplicitTemplateEnterNumbers)).map((n) => n.hash),
      );
      const sumHashes = new Set(
        flattenTemplateTree(parseTemplate(ExplicitTemplateSumNumbers)).map((n) => n.hash),
      );
      const uniqueToEnter = [...enterHashes].filter((h) => !sumHashes.has(h));
      expect(uniqueToEnter.length).toBeGreaterThan(0);

      // Manipulate KV: set access count above threshold and backdate all entries
      const oldTimestamp = (Date.now() - 8 * 24 * 60 * 60 * 1000).toString(); // 8 days ago
      await pl.withWriteTx("manipulateKV", async (tx) => {
        tx.setKValue(testCache, ACCESS_COUNT_KEY, (GC_ACCESS_THRESHOLD + 1).toString());
        for (const hash of enterHashes) {
          tx.setKValue(testCache, ACCESS_KEY_PREFIX + hash, oldTimestamp);
        }
        await tx.commit();
      });

      // Trigger GC by calling loadTemplateCached with sum-numbers
      // (the first batch will see high access count and run GC, evicting old enter entries)
      await loadTemplateCached(pl, TplSpecSumExplicit, { cacheResourceId: testCache });

      // Verify: enter-only entries should be evicted (shared ones may be re-created by sum)
      await pl.withReadTx("verifyGC", async (tx) => {
        for (const hash of uniqueToEnter) {
          const exists = await tx.fieldExists(field(testCache, hash));
          expect(exists).toBe(false);
        }
        // Access count should be low (reset to "0" by GC, then incremented once)
        const count = await tx.getKValueStringIfExists(testCache, ACCESS_COUNT_KEY);
        expect(parseInt(count ?? "0", 10)).toBeLessThanOrEqual(1);
      });
    });
  }, 15000);

  test("does not evict fresh entries", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      // Cache a template (entries will have fresh timestamps)
      await loadTemplateCached(pl, TplSpecEnterExplicit, { cacheResourceId: testCache });

      // Set access count above threshold but keep timestamps fresh
      await pl.withWriteTx("setHighCount", async (tx) => {
        tx.setKValue(testCache, ACCESS_COUNT_KEY, (GC_ACCESS_THRESHOLD + 1).toString());
        await tx.commit();
      });

      // Get entry hashes before GC
      const entryHashes: string[] = [];
      await pl.withReadTx("readEntries", async (tx) => {
        const kvs = await tx.listKeyValuesString(testCache);
        for (const { key } of kvs) {
          if (key.startsWith(ACCESS_KEY_PREFIX)) {
            entryHashes.push(key.slice(ACCESS_KEY_PREFIX.length));
          }
        }
      });

      // Trigger GC
      await loadTemplateCached(pl, TplSpecSumExplicit, { cacheResourceId: testCache });

      // Fresh entries should NOT be evicted
      await pl.withReadTx("verifyNotEvicted", async (tx) => {
        for (const hash of entryHashes) {
          const exists = await tx.fieldExists(field(testCache, hash));
          expect(exists).toBe(true);
        }
      });
    });
  }, 15000);
});
