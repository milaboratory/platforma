import {
  BlockRegistryV2,
  storageByUrl,
  publishBlock,
  readFacadeKindDependency,
  resolveFacadeKind,
  resolveKind,
  KindOverview,
  kindOverviewPath,
  npmNameToKindPath,
} from "@platforma-sdk/block-tools";
import { BlockPackManifest, StableChannel } from "@milaboratories/pl-model-middle-layer";
import { BlockPointer } from "@milaboratories/milaboratories.test-block-table";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { regTest } from "./test_utils";

/**
 * L1 lifecycle test (design `01-kind-and-lifecycle.md` → Testing strategy,
 * step 4): the whole kind loop — build → publish (kind-first) → reconcile →
 * resolve — headless on a `file:` registry (FSStorage), no CI, no AWS. Modeled
 * on `simple.test.ts`. The block is `etc/blocks/table-test`, built and packed by
 * the turbo dependency graph before this test runs.
 */
regTest(
  "kind lifecycle: publish (kind-first) -> reconcile -> resolve on a file: registry",
  async ({ expect, tmpFolder }) => {
    const registryUrl = `file:${tmpFolder}`;
    const storage = storageByUrl(registryUrl);
    const registry = new BlockRegistryV2(storage);

    // Locate the built block through its BlockPointer: packUrl -> block-pack
    // (manifest + file reader root), rootUrl -> facade package root (holds the
    // package.json with the direct kind dependency).
    const packDir = fileURLToPath(BlockPointer.packUrl);
    const facadeDir = fileURLToPath(BlockPointer.rootUrl);
    const manifest = BlockPackManifest.parse(
      JSON.parse(await fsp.readFile(path.join(packDir, "manifest.json"), { encoding: "utf-8" })),
    );

    // The block declares a kind, and it resolves to concrete artifacts.
    const facadeDep = readFacadeKindDependency(facadeDir);
    expect(facadeDep).toBeDefined();
    const kindNpmName = facadeDep!.npmName;
    const resolvedKind = await resolveFacadeKind(facadeDir, kindNpmName);
    const kindVersion = resolvedKind.manifest.kind.version;

    // --- Publish, kind-first: version-match gate -> publishKind -> publishPackage.
    await publishBlock(registry, manifest, facadeDir, async (file) =>
      Buffer.from(await fsp.readFile(path.resolve(packDir, file))),
    );
    await registry.addPackageToChannel(manifest.description.id, StableChannel);
    await registry.updateIfNeeded();

    // --- Reconcile produced the per-kind overview projection (single pass, no
    // separate kind reconciler).
    const overviewPath = kindOverviewPath(npmNameToKindPath(kindNpmName));
    const overviewRaw = await storage.getFile(overviewPath);
    expect(overviewRaw, `kind overview missing at ${overviewPath}`).toBeDefined();
    const overview = KindOverview.parse(JSON.parse(overviewRaw!.toString()));
    expect(overview.implementers).toHaveLength(1);
    expect(overview.implementers[0].id).toStrictEqual(manifest.description.id);
    expect(overview.implementers[0].channels).toStrictEqual([StableChannel]);

    // --- Resolution: exact / minor-float / patch-float all pick the stable block.
    for (const selector of [kindVersion, `^${kindVersion}`, `~${kindVersion}`]) {
      const r = resolveKind(overview, selector, { allowUnstable: false });
      expect(r, `selector ${selector}`).toStrictEqual({
        ok: true,
        blockId: manifest.description.id,
        channel: StableChannel,
      });
    }

    // A selector matching no kind version fails cleanly.
    expect(resolveKind(overview, "99.0.0", { allowUnstable: false })).toStrictEqual({
      ok: false,
      reason: "no-matching-kind-version",
    });

    // --- Source-hash immutability guard + idempotent republish.
    // Identical content -> idempotent no-op (must not throw).
    await registry.publishKind(resolvedKind.manifest, resolvedKind.fileReader);
    // Same version, different source content -> hard fail.
    await expect(
      registry.publishKind(
        { ...resolvedKind.manifest, sourceHash: "0".repeat(64) },
        resolvedKind.fileReader,
      ),
    ).rejects.toThrow(/different content/i);
  },
);
