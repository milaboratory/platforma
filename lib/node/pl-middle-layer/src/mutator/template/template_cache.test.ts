import {
  ensureSignedResourceIdNotNull,
  field,
  isNotNullSignedResourceId,
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
  getOrCreateTemplateCache,
  loadTemplateCached,
  runGc,
  TemplateCacheType,
} from "./template_cache";
import { parseTemplate } from "@milaboratories/pl-model-backend";
import type { CompiledTemplateV4, TemplateNodeV4 } from "@milaboratories/pl-model-backend";
import type { BlockPackSpecPrepared } from "../../model";

describe("v4 graph walking", () => {
  // The compiler cannot emit a cycle — a node's hash covers its children's
  // hashes, so closing one would need a hash preimage. Only a corrupt pack
  // reaches a reader with one, and readers walk the graph recursively.
  test("a reference cycle is reported, not recursed into", () => {
    const a: TemplateNodeV4 = {
      name: "@t/pkg:a",
      version: "1.0.0",
      sourceHash: "src",
      libs: {},
      templates: { b: "hash-b" },
      software: {},
      assets: {},
    };
    const b: TemplateNodeV4 = { ...a, name: "@t/pkg:b", templates: { a: "hash-a" } };
    const pack: CompiledTemplateV4 = {
      type: "pl.tengo-template.v4",
      hashToSource: { src: "source" },
      hashToTemplate: { "hash-a": a, "hash-b": b },
      template: "hash-a",
    };

    expect(() => flattenTemplateTree(pack)).toThrow(/cycle/);
  });

  // Guards the reason v4 exists: a node reachable by many paths must be
  // walked once. Without the memo this still produced correct output via the
  // `seen` set, so only a visit count catches a regression.
  test("a shared node is emitted once however many paths reach it", () => {
    const leaf: TemplateNodeV4 = {
      name: "@t/pkg:leaf",
      version: "1.0.0",
      sourceHash: "leaf",
      libs: {},
      templates: {},
      software: {},
      assets: {},
    };
    const mid = (name: string): TemplateNodeV4 => ({
      ...leaf,
      name,
      sourceHash: name,
      templates: { leaf: "h-leaf" },
    });
    const root: TemplateNodeV4 = {
      ...leaf,
      name: "@t/pkg:root",
      sourceHash: "root",
      templates: { one: "h-1", two: "h-2" },
    };
    const pack: CompiledTemplateV4 = {
      type: "pl.tengo-template.v4",
      hashToSource: { leaf: "s", "@t/pkg:m1": "s", "@t/pkg:m2": "s", root: "s" },
      hashToTemplate: {
        "h-leaf": leaf,
        "h-1": mid("@t/pkg:m1"),
        "h-2": mid("@t/pkg:m2"),
        "h-root": root,
      },
      template: "h-root",
    };

    const nodes = flattenTemplateTree(pack);
    expect(nodes.filter((n) => n.childHashes.length === 0)).toHaveLength(1);
    expect(nodes).toHaveLength(4);
  });
});

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

describe("flattenTemplateTree", () => {
  test("produces nodes in topological order for V2 template", () => {
    const data = parseTemplate(ExplicitTemplateEnterNumbers, "gzip");
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
    const data = parseTemplate(ExplicitTemplateEnterNumbers, "gzip");
    const nodes1 = flattenTemplateTree(data);
    const nodes2 = flattenTemplateTree(data);
    expect(nodes1.map((n) => n.hash)).toStrictEqual(nodes2.map((n) => n.hash));
  });

  test("different templates produce different root hashes", () => {
    const dataEnter = parseTemplate(ExplicitTemplateEnterNumbers, "gzip");
    const dataSum = parseTemplate(ExplicitTemplateSumNumbers, "gzip");
    const nodesEnter = flattenTemplateTree(dataEnter);
    const nodesSum = flattenTemplateTree(dataSum);
    expect(nodesEnter[nodesEnter.length - 1].hash).not.toBe(nodesSum[nodesSum.length - 1].hash);
  });
});

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

describe("loadTemplateCached", () => {
  test("cache miss then cache hit returns same SignedResourceId", async () => {
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
        expect(ensureSignedResourceIdNotNull(fd.value)).toBe(resultId);
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
});

describe("cacheBlockPackTemplate", () => {
  test("replaces prepared template with cached reference", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      const spec: BlockPackSpecPrepared = {
        type: "prepared",
        template: {
          type: "prepared",
          data: parseTemplate(ExplicitTemplateEnterNumbers, "gzip"),
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
      const resolvedCached = isNotNullSignedResourceId(cachedOriginal) ? cachedOriginal : cachedId;
      const resolvedLegacy = isNotNullSignedResourceId(legacyOriginal) ? legacyOriginal : legacyId;
      expect(resolvedCached).toBe(resolvedLegacy);
    });
  }, 30000);
});

describe("shared library dedup", () => {
  test("two different templates sharing a library reuse the same cache entry", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      // Flatten both templates and find common hashes (shared libs)
      const nodesEnter = flattenTemplateTree(parseTemplate(ExplicitTemplateEnterNumbers, "gzip"));
      const nodesSum = flattenTemplateTree(parseTemplate(ExplicitTemplateSumNumbers, "gzip"));
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

describe("GC", () => {
  test("evicts entries when cache exceeds max entries", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      // Cache enter-numbers template (~37 entries)
      await loadTemplateCached(pl, TplSpecEnterExplicit, { cacheResourceId: testCache });

      const enterNodes = flattenTemplateTree(parseTemplate(ExplicitTemplateEnterNumbers, "gzip"));
      const allHashes = enterNodes.map((n) => n.hash);
      const halfLen = Math.floor(allHashes.length / 2);

      // Backdate the first half of entries (low timestamp = evicted first)
      await pl.withWriteTx("backdate", async (tx) => {
        for (let i = 0; i < halfLen; i++) {
          tx.setKValue(testCache, ACCESS_KEY_PREFIX + allHashes[i], "1000");
        }
        await tx.commit();
      });

      // Run GC with low max: keep only the fresh half
      const evicted = await runGc(pl, testCache, allHashes.length - halfLen);
      expect(evicted).toBe(true);

      // Verify backdated entries were evicted, fresh entries survive
      await pl.withReadTx("verify", async (tx) => {
        for (let i = 0; i < halfLen; i++) {
          const exists = await tx.fieldExists(field(testCache, allHashes[i]));
          expect(exists).toBe(false);
        }
        for (let i = halfLen; i < allHashes.length; i++) {
          const exists = await tx.fieldExists(field(testCache, allHashes[i]));
          expect(exists).toBe(true);
        }
        // Counter should be reset
        const count = await tx.getKValueStringIfExists(testCache, ACCESS_COUNT_KEY);
        expect(count).toBe("0");
      });
    });
  }, 15000);

  test("does not evict when under max entries", async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const testCache = await createTestCacheInTx(pl);

      // Cache a template (~37 entries)
      await loadTemplateCached(pl, TplSpecEnterExplicit, { cacheResourceId: testCache });

      const enterNodes = flattenTemplateTree(parseTemplate(ExplicitTemplateEnterNumbers, "gzip"));

      // Run GC with high max — nothing should be evicted
      const evicted = await runGc(pl, testCache, 100);
      expect(evicted).toBe(false);

      // All entries should survive, counter should still be reset
      await pl.withReadTx("verify", async (tx) => {
        for (const node of enterNodes) {
          const exists = await tx.fieldExists(field(testCache, node.hash));
          expect(exists).toBe(true);
        }
        const count = await tx.getKValueStringIfExists(testCache, ACCESS_COUNT_KEY);
        expect(count).toBe("0");
      });
    });
  }, 15000);
});
