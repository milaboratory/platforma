import {
  BlockRegistryV2,
  KindManifest,
  KindOverview,
  RegistryV2Reader,
  folderReaderByUrl,
  kindContentPrefix,
  kindOverviewPath,
  npmNameToKindPath,
  publishBlock,
  readFacadeKindDependency,
  resolveFacadeKind,
  storageByUrl,
} from "@platforma-sdk/block-tools";
import {
  AnyChannel,
  BlockPackManifest,
  overrideManifestVersion,
  StableChannel,
} from "@milaboratories/pl-model-middle-layer";
import { formatKindRef } from "@milaboratories/pl-model-common";
import { BlockPointer } from "@milaboratories/milaboratories.test-block-table";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { regTest } from "./test_utils";

/**
 * Publishing a kind, on the same axes block publishing is covered on.
 *
 * `simple.test.ts` takes a real built block through publish → reconcile → channel
 * add → read back → channel remove → read back, at two versions, and asserts what
 * landed in the registry each time. This is that test for the `kinds/` tree, and it
 * exists because the kind side had a different shape of coverage: `kind-lifecycle.test.ts`
 * proves the immutability guard and the selector tiers on **one** kind version with
 * **one** implementer in **one** channel, reading the projection straight out of
 * storage rather than through the reader the middle layer actually calls.
 *
 * What is added here, in the order the test does it:
 *
 *   - the exact set of files a kind publish writes under its version folder;
 *   - the projection as a **derived** view — `implementers` and `kindVersions` — not
 *     just its existence;
 *   - resolution through `RegistryV2Reader.resolveKind`, the entry point the middle
 *     layer uses, rather than the pure resolver underneath it;
 *   - a **second kind version with its own implementing block**, which is what makes
 *     the selector tiers mean anything: with one version on the registry every
 *     selector picks the same block whether or not the ranges are right;
 *   - a channel change after the fact, proving the projection is re-derived rather
 *     than written once at publish time.
 *
 * Headless on a `file:` registry, like the tests it mirrors — no backend, no AWS.
 * The block is `etc/blocks/table-test`, built and packed by the turbo graph before
 * this runs.
 */
regTest(
  "kind publication: publish -> reconcile -> resolve, across two kind versions and a channel change",
  async ({ expect, tmpFolder }) => {
    const registryUrl = `file:${tmpFolder}`;
    const storage = storageByUrl(registryUrl);
    const registry = new BlockRegistryV2(storage);

    const packDir = fileURLToPath(BlockPointer.packUrl);
    const facadeDir = fileURLToPath(BlockPointer.rootUrl);
    const readPackFile = async (file: string) =>
      Buffer.from(await fsp.readFile(path.resolve(packDir, file)));

    const manifestV1 = BlockPackManifest.parse(
      JSON.parse(await fsp.readFile(path.join(packDir, "manifest.json"), { encoding: "utf-8" })),
    );
    const blockV1 = manifestV1.description.id;

    const facadeDep = readFacadeKindDependency(facadeDir);
    expect(facadeDep).toBeDefined();
    const resolvedKind = await resolveFacadeKind(facadeDir, facadeDep!.npmName);
    const kindName = resolvedKind.manifest.kind.name;
    const kindV1 = resolvedKind.manifest.kind.version;
    const kindLoc = npmNameToKindPath(kindName);

    // --- Publish the first version, through the real entry point ------------

    await publishBlock(registry, manifestV1, facadeDir, readPackFile);
    await registry.addPackageToChannel(blockV1, StableChannel);
    await registry.updateIfNeeded();

    // Every file the manifest declares, plus the manifest itself as the commit
    // marker — and nothing else. The block side asserts its content folder the same
    // way; without it a publish that silently dropped an artifact would still pass
    // every resolution assertion below, because resolution only reads the projection.
    const contentFiles = await storage.listFiles(`${kindContentPrefix(kindName, kindV1)}/`);
    expect(contentFiles.sort()).toStrictEqual(
      [...resolvedKind.manifest.files.map((f) => f.name), "manifest.json"].sort(),
    );

    // The stored manifest is the built one plus the registry's own upload stamp.
    const storedManifest = KindManifest.parse(
      JSON.parse(
        (await storage.getFile(`${kindContentPrefix(kindName, kindV1)}/manifest.json`))!.toString(),
      ),
    );
    expect(storedManifest.sourceHash).toStrictEqual(resolvedKind.manifest.sourceHash);
    expect(storedManifest.firstUploadTimestamp).toBeDefined();

    // The projection, both halves: the flat implementer list the reconciler rewrites,
    // and the per-kind-version view a reader resolves against.
    const afterV1 = await readProjection();
    expect(afterV1.implementers).toStrictEqual([
      { id: blockV1, kindVersion: kindV1, channels: [StableChannel] },
    ]);
    expect(afterV1.kindVersions).toHaveLength(1);
    expect(afterV1.kindVersions[0].kindVersion).toStrictEqual(kindV1);
    expect(afterV1.kindVersions[0].latestByChannel[StableChannel]).toStrictEqual(blockV1);
    expect(afterV1.kindVersions[0].latestByChannel[AnyChannel]).toStrictEqual(blockV1);

    // Resolution through the reader the middle layer calls, not the resolver beneath it.
    const reader = new RegistryV2Reader(folderReaderByUrl(registryUrl));
    expect(await resolve(kindV1)).toMatchObject({
      type: "from-registry-v2",
      id: blockV1,
      channel: StableChannel,
    });

    // --- A second kind version, with its own implementing block ------------

    // Same content at a new version: the immutability guard is per version, and what
    // is under test here is the version axis, not the bytes.
    const kindV2 = "1.1.0";
    await registry.publishKind(
      { ...resolvedKind.manifest, kind: { ...resolvedKind.manifest.kind, version: kindV2 } },
      resolvedKind.fileReader,
    );

    // The block that implements it. Published at the primitive level rather than
    // through `publishBlock`, because that gate compares the model's compiled kind
    // reference against the facade's — and this block was built against `kindV1`.
    // What the projection reads is the stored manifest's `kind`, which is what this
    // patches.
    const bumped = overrideManifestVersion(manifestV1, bumpPatch(blockV1.version));
    const manifestV2 = BlockPackManifest.parse({
      ...bumped,
      description: {
        ...bumped.description,
        kind: formatKindRef({ name: kindName, version: kindV2 }),
      },
    });
    const blockV2 = manifestV2.description.id;

    await registry.publishPackage(manifestV2, readPackFile);
    await registry.addPackageToChannel(blockV2, StableChannel);
    await registry.updateIfNeeded();

    const afterV2 = await readProjection();
    expect(afterV2.implementers).toStrictEqual([
      { id: blockV1, kindVersion: kindV1, channels: [StableChannel] },
      { id: blockV2, kindVersion: kindV2, channels: [StableChannel] },
    ]);
    expect(afterV2.kindVersions.map((v) => v.kindVersion).sort()).toStrictEqual([kindV1, kindV2]);

    // The tiers, now that there is something for them to choose between. Exact and
    // patch-floor stay on the kind version whose behavior the params were written
    // against; the minor floor moves to the newer one.
    expect(await resolve(kindV1)).toMatchObject({ id: blockV1 });
    expect(await resolve(`~${kindV1}`)).toMatchObject({ id: blockV1 });
    expect(await resolve(`^${kindV1}`)).toMatchObject({ id: blockV2 });

    // --- A channel change after the fact ----------------------------------

    // The projection is derived from block manifests and channel membership on every
    // reconcile, so taking the newer implementation out of `stable` has to change what
    // a floating selector resolves to — nothing republished the kind.
    await registry.removePackageFromChannel(blockV2, StableChannel);
    await registry.updateIfNeeded();

    const afterUnstable = await readProjection();
    expect(
      afterUnstable.implementers.find((i) => i.id.version === blockV2.version)?.channels,
    ).toStrictEqual([]);

    // The kind version still matches; what is missing is a stable block implementing
    // it. Those are different failures and the reader keeps them apart.
    await expect(resolve(`^${kindV1}`)).rejects.toThrow(/no-stable-implementation/);
    expect(await resolve(`^${kindV1}`, { allowUnstable: true })).toMatchObject({ id: blockV2 });

    // And the frozen selector is untouched by any of it.
    expect(await resolve(`~${kindV1}`)).toMatchObject({ id: blockV1, channel: StableChannel });

    // A selector matching no published kind version is a different failure again.
    await expect(resolve("99.0.0")).rejects.toThrow(/no-matching-kind-version/);

    async function readProjection(): Promise<KindOverview> {
      const raw = await storage.getFile(kindOverviewPath(kindLoc));
      expect(raw, `kind overview missing at ${kindOverviewPath(kindLoc)}`).toBeDefined();
      return KindOverview.parse(JSON.parse(raw!.toString()));
    }

    async function resolve(selector: string, options?: { allowUnstable: boolean }) {
      return await reader.resolveKind(`${kindName}@${selector}` as never, {
        allowUnstable: options?.allowUnstable ?? false,
      });
    }
  },
);

/** Next patch version, for publishing a second version of the same package. */
function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) throw new Error(`Malformed version: ${version}`);
  return `${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}`;
}
