import { blockSpec } from "@milaboratories/milaboratories.test-enter-numbers-v3";
import {
  field,
  isNotNullResourceId,
  poll,
  TestHelpers,
  toGlobalResourceId,
} from "@milaboratories/pl-client";
import type { AnyResourceRef } from "@milaboratories/pl-client";
import {
  flattenTemplateTree,
  loadTemplate,
  loadTemplateCached,
  TemplateCacheType,
} from "@milaboratories/pl-middle-layer";
import { parseTemplate } from "@milaboratories/pl-model-backend";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// Resolve V3 template content from the block package's built output
const v3WorkflowPath = path.join(blockSpec.folder, "block-pack", "main.plj.gz");
const V3TemplateContent = fs.existsSync(v3WorkflowPath)
  ? fs.readFileSync(v3WorkflowPath)
  : undefined;

function createTestCacheInTx(pl: Parameters<Parameters<typeof TestHelpers.withTempRoot>[0]>[0]) {
  return pl.withWriteTx("createTestCache", async (tx) => {
    const cache = tx.createStruct(TemplateCacheType);
    tx.createField(field(pl.clientRoot, "__testCache"), "Dynamic", cache);
    tx.lock(cache);
    await tx.commit();
    return await cache.globalId;
  });
}

describe("V3 template cache", () => {
  test.skipIf(!V3TemplateContent)("flattenTemplateTree produces topological order for V3", () => {
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
