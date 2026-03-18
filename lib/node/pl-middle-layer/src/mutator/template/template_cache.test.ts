import {
  ensureResourceIdNotNull,
  field,
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
  cacheBlockPackTemplate,
  dropTemplateCache,
  flattenTemplateTree,
  getOrCreateTemplateCache,
  loadTemplateCached,
  TemplateCacheType,
} from "./template_cache";
import { parseTemplate } from "@milaboratories/pl-model-backend";
import type { BlockPackSpecPrepared } from "../../model";

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
    const data = parseTemplate(ExplicitTemplateEnterNumbers);
    const nodes = flattenTemplateTree(data);
    expect(nodes.length).toBeGreaterThan(0);

    // All hashes are unique
    const hashes = nodes.map((n) => n.hash);
    expect(new Set(hashes).size).toBe(hashes.length);

    // Last node is root (it may have children, earlier nodes should not depend on later ones)
    const rootNode = nodes[nodes.length - 1];
    expect(rootNode.childHashes.length).toBeGreaterThanOrEqual(0);

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
      // Should create cache automatically on user root
      const id = await loadTemplateCached(pl, TplSpecEnterExplicit);
      expect(id).toBeDefined();

      // Second call should reuse the cache
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

describe("template cache produces equivalent resources", () => {
  test("cached and legacy loadTemplate produce same resource type", async () => {
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

      // Both should produce resources of the same type
      // (they won't be the same ResourceId since they're created separately)
      expect(cachedId).toBeDefined();
      expect(legacyId).toBeDefined();

      // Verify both are valid by reading their data
      await pl.withReadTx("verify", async (tx) => {
        const cachedData = await tx.getResourceData(cachedId, true);
        const legacyData = await tx.getResourceData(legacyId, true);
        expect(cachedData.type.name).toBe(legacyData.type.name);
        expect(cachedData.type.version).toBe(legacyData.type.version);
        expect(cachedData.fields.length).toBe(legacyData.fields.length);
      });
    });
  }, 15000);
});
