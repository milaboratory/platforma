import { test, expect } from "vitest";
import { RegistryStorage, storageByUrl } from "../../io";
import { randomUUID } from "crypto";
import path from "path";
import fsp from "fs/promises";
import { BlockRegistryV2 } from "./registry";
import {
  UpdateSuggestions,
  BlockPackManifest,
  StableChannel,
} from "@milaboratories/pl-model-middle-layer";
import { inferUpdateSuggestions } from "./registry_reader";
import { OverviewSnapshotsPrefix } from "./schema_internal";
import { KindOverview, kindOverviewPath, npmNameToKindPath } from "./schema_kinds";
import { resolveKind } from "./kind_resolver";

type TestStorageInstance = {
  storage: RegistryStorage;
  teardown: () => Promise<void>;
};
type TestStorageTarget = {
  name: string;
  storageProvider: () => TestStorageInstance;
};
const testStorages: TestStorageTarget[] = [
  {
    name: "local",
    storageProvider: () => {
      const uuid = randomUUID().toString();
      const tmp = path.resolve("tmp");
      const storagePath = path.resolve(tmp, uuid);
      const storage = storageByUrl("file://" + storagePath);
      return {
        storage,
        teardown: async () => {
          await fsp.rm(storagePath, { recursive: true, force: true });
        },
      };
    },
  },
];

const testS3Address = process.env.TEST_S3_ADDRESS;
if (testS3Address !== undefined) {
  testStorages.push({
    name: "s3",
    storageProvider: () => {
      const uuid = randomUUID().toString();
      const testS3AddressURL = new URL(testS3Address!);
      testS3AddressURL.pathname = `${testS3AddressURL.pathname.replace(/\/$/, "")}/${uuid}`;
      const storage = storageByUrl(testS3AddressURL.toString());
      return {
        storage,
        teardown: async () => {
          const allFiles = await storage.listFiles("");
          console.log("Deleting: ", allFiles);
          await storage.deleteFiles(...allFiles);
        },
      };
    },
  });
}

test.each(testStorages)("registry snapshots test with $name", async ({ storageProvider }) => {
  const { storage, teardown } = storageProvider();
  const registry = new BlockRegistryV2(storage);

  try {
    // Force an update to trigger snapshot creation (even with empty registry)
    await registry.updateIfNeeded("force");

    // Check that snapshot files actually exist in storage
    const snapshotFiles = await storage.listFiles(OverviewSnapshotsPrefix);
    expect(snapshotFiles.length).toBeGreaterThan(0);

    // Check that snapshots were created
    const snapshots = await registry.listGlobalOverviewSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0]).toHaveProperty("timestamp");
    expect(snapshots[0]).toHaveProperty("path");
    expect(snapshots[0].path).toMatch(/^_overview_snapshots_v2\/global\/.*\.json\.gz$/);

    // Test that global overview files exist (should be empty initially)
    const globalOverview = await registry.getGlobalOverview();
    expect(globalOverview).toBeDefined();
    expect(globalOverview?.packages).toHaveLength(0);

    // Test restore functionality
    const snapshotId = snapshots[0].timestamp;
    await registry.restoreGlobalOverviewFromSnapshot(snapshotId);

    // Verify restored overview is still valid
    const restoredOverview = await registry.getGlobalOverview();
    expect(restoredOverview).toBeDefined();
    expect(restoredOverview?.packages).toHaveLength(0);
  } finally {
    await teardown();
  }
});

test.each(testStorages)(
  "registry snapshots disabled test with $name",
  async ({ storageProvider }) => {
    const { storage, teardown } = storageProvider();
    const registry = new BlockRegistryV2(storage, undefined, { skipSnapshotCreation: true });

    try {
      // Force an update which would normally create snapshots
      await registry.updateIfNeeded("force");

      // Check that no snapshots were created
      const snapshots = await registry.listGlobalOverviewSnapshots();
      expect(snapshots).toHaveLength(0);

      const snapshotFiles = await storage.listFiles(OverviewSnapshotsPrefix);
      expect(snapshotFiles).toHaveLength(0);
    } finally {
      await teardown();
    }
  },
);

test.each(testStorages)(
  "force mode removes deleted packages and versions with $name",
  async ({ storageProvider }) => {
    const { storage, teardown } = storageProvider();
    const registry = new BlockRegistryV2(storage);

    try {
      // Create mock manifests for testing
      const createMockManifest = (
        org: string,
        name: string,
        version: string,
      ): BlockPackManifest => ({
        schema: "v2",
        description: {
          id: { organization: org, name: name, version: version },
          title: `Test ${name}`,
          summary: "Test package",
          components: {
            workflow: { type: "workflow-v1", main: { type: "relative", path: "workflow.json" } },
            model: { type: "relative", path: "model.json" },
            ui: { type: "relative", path: "ui.json" },
          },
          meta: {
            title: `Test ${name}`,
            description: "Test package description",
            organization: {
              name: "Test Organization",
              url: "https://test.com",
            },
            tags: [],
          },
        },
        files: [
          {
            name: "model.json",
            size: 13,
            sha256: "6FD977DB9B2AFE87A9CEEE48432881299A6AAF83D935FBBE83007660287F9C2E",
          },
        ],
      });

      const mockFileReader = async (fileName: string) => {
        if (fileName === "model.json") {
          return Buffer.from('{"test":true}');
        }
        throw new Error(`Unknown file: ${fileName}`);
      };

      // 1. Publish multiple packages and versions
      const pkg1v1 = createMockManifest("testorg", "pkg1", "1.0.0");
      const pkg1v2 = createMockManifest("testorg", "pkg1", "2.0.0");
      const pkg2v1 = createMockManifest("testorg", "pkg2", "1.0.0");
      const pkg3v1 = createMockManifest("anotherorg", "pkg3", "1.0.0");

      await registry.publishPackage(pkg1v1, mockFileReader);
      await registry.publishPackage(pkg1v2, mockFileReader);
      await registry.publishPackage(pkg2v1, mockFileReader);
      await registry.publishPackage(pkg3v1, mockFileReader);

      // Update registry to create overviews
      await registry.updateIfNeeded("normal");

      // Verify initial state
      let globalOverview = await registry.getGlobalOverview();
      expect(globalOverview?.packages).toHaveLength(3); // testorg:pkg1, testorg:pkg2, anotherorg:pkg3

      let pkg1Overview = await registry.getPackageOverview({
        organization: "testorg",
        name: "pkg1",
      });
      expect(pkg1Overview?.versions).toHaveLength(2); // v1.0.0 and v2.0.0

      let pkg2Overview = await registry.getPackageOverview({
        organization: "testorg",
        name: "pkg2",
      });
      expect(pkg2Overview?.versions).toHaveLength(1); // v1.0.0

      let pkg3Overview = await registry.getPackageOverview({
        organization: "anotherorg",
        name: "pkg3",
      });
      expect(pkg3Overview?.versions).toHaveLength(1); // v1.0.0

      // 2. Manually delete some packages/versions from storage (simulating external deletion)
      // Delete pkg1 v1.0.0
      await storage.deleteFiles(
        "v2/testorg/pkg1/1.0.0/manifest.json",
        "v2/testorg/pkg1/1.0.0/model.json",
      );

      // Delete entire pkg2
      await storage.deleteFiles(
        "v2/testorg/pkg2/1.0.0/manifest.json",
        "v2/testorg/pkg2/1.0.0/model.json",
      );

      // Leave pkg1 v2.0.0 and pkg3 v1.0.0 intact

      // 3. Count snapshots before force mode
      const initialSnapshots = await storage.listFiles("_overview_snapshots_v2/");

      // 4. Run force mode - should create pre-write snapshots and rebuild from scratch
      await registry.updateIfNeeded("force");

      // 5. Verify pre-write snapshots were created
      const finalSnapshots = await storage.listFiles("_overview_snapshots_v2/");
      expect(finalSnapshots.length).toBeGreaterThan(initialSnapshots.length);

      // Check for pre-write snapshots (should contain "-prewrite-" in filename)
      const preWriteSnapshots = finalSnapshots.filter((s) => s.includes("-prewrite-"));
      expect(preWriteSnapshots.length).toBeGreaterThan(0);

      // 6. Verify overviews now only reflect what exists in storage
      globalOverview = await registry.getGlobalOverview();
      expect(globalOverview?.packages).toHaveLength(2); // Only testorg:pkg1 and anotherorg:pkg3 should remain

      const remainingPackageNames = globalOverview?.packages
        .map((p) => `${p.id.organization}:${p.id.name}`)
        .sort();
      expect(remainingPackageNames).toEqual(["anotherorg:pkg3", "testorg:pkg1"]);

      // 7. Verify pkg1 now only has v2.0.0
      pkg1Overview = await registry.getPackageOverview({ organization: "testorg", name: "pkg1" });
      expect(pkg1Overview?.versions).toHaveLength(1);
      expect(pkg1Overview?.versions[0].description.id.version).toBe("2.0.0");

      // 8. Verify pkg2 overview is unchanged (since pkg2 was completely deleted,
      // force mode doesn't process it, so the old overview file remains)
      pkg2Overview = await registry.getPackageOverview({ organization: "testorg", name: "pkg2" });
      expect(pkg2Overview?.versions).toHaveLength(1); // Old overview remains

      // 9. Verify pkg3 is unchanged
      pkg3Overview = await registry.getPackageOverview({
        organization: "anotherorg",
        name: "pkg3",
      });
      expect(pkg3Overview?.versions).toHaveLength(1);
      expect(pkg3Overview?.versions[0].description.id.version).toBe("1.0.0");
    } finally {
      await teardown();
    }
  },
);

/**
 * Fixture for the kind-projection test: a block version whose description
 * carries a `{name}@{version}` kind reference. Only the id and that reference
 * matter to the reconciler's kind pass.
 */
const kindTestKindNpmName = "@platforma-open/kindorg.kindpkg.kind";

function kindImplementingManifest(version: string, kindVersion: string): BlockPackManifest {
  return BlockPackManifest.parse({
    schema: "v2",
    description: {
      id: { organization: "testorg", name: "kindblk", version },
      title: "Kind implementing block",
      summary: "Test package",
      kind: `${kindTestKindNpmName}@${kindVersion}`,
      components: {
        workflow: { type: "workflow-v1", main: { type: "relative", path: "workflow.json" } },
        model: { type: "relative", path: "model.json" },
        ui: { type: "relative", path: "ui.json" },
      },
      meta: {
        title: "Kind implementing block",
        description: "Test package description",
        organization: { name: "Test Organization", url: "https://test.com" },
        tags: [],
      },
    },
    files: [
      {
        name: "model.json",
        size: 13,
        sha256: "6FD977DB9B2AFE87A9CEEE48432881299A6AAF83D935FBBE83007660287F9C2E",
      },
    ],
  });
}

const kindTestFileReader = async (fileName: string) => {
  if (fileName === "model.json") return Buffer.from('{"test":true}');
  throw new Error(`Unknown file: ${fileName}`);
};

/**
 * Channel membership is per *block version* (`v2/{org}/{name}/{version}/channels/{channel}`),
 * and every writer of a channel marker drops an update seed for that same
 * version. So a `normal` (read-modify-write) reconcile pass always re-reads the
 * versions whose membership changed, and the per-entry `channels` snapshot
 * stored in `kinds/{org}/{name}/overview.json` cannot go stale behind it.
 *
 * This test pins that invariant on both sides of a stable-channel handover:
 * adding `stable` to a newer version (both versions stable — marking is not a
 * moving pointer, so the older one keeps its own membership) and then removing
 * `stable` from the older one. Either step must leave every entry's snapshot
 * equal to the markers actually present in storage, and stable resolution must
 * follow. Regression guard: any future change that mutates a marker without
 * seeding that exact version — or that turns `stable` into a single moving
 * pointer — leaves the kind index asserting a version is stable when it is not.
 */
test.each(testStorages)(
  "channel handover keeps kind overview channel snapshots correct in normal mode with $name",
  async ({ storageProvider }) => {
    const { storage, teardown } = storageProvider();
    const registry = new BlockRegistryV2(storage, undefined, { skipSnapshotCreation: true });

    const ovPath = kindOverviewPath(npmNameToKindPath(kindTestKindNpmName));
    const readKindOverview = async (): Promise<KindOverview> => {
      const content = await storage.getFile(ovPath);
      expect(content).toBeDefined();
      return KindOverview.parse(JSON.parse(content!.toString()));
    };
    const channelsOf = (overview: KindOverview, version: string): string[] => {
      const entry = overview.implementers.find((i) => i.id.version === version);
      expect(entry, `no implementer entry for ${version}`).toBeDefined();
      return [...entry!.channels].sort();
    };
    const stableResolution = (overview: KindOverview) =>
      resolveKind(overview, "1.0.0", { allowUnstable: false });

    try {
      // Two versions of one block, both implementing kind 1.0.0.
      const a = kindImplementingManifest("1.0.0", "1.0.0");
      const b = kindImplementingManifest("2.0.0", "1.0.0");
      await registry.publishPackage(a, kindTestFileReader);
      await registry.publishPackage(b, kindTestFileReader);

      // A stable, reconcile.
      await registry.addPackageToChannel(a.description.id, StableChannel);
      await registry.updateIfNeeded("normal");

      let overview = await readKindOverview();
      expect(channelsOf(overview, "1.0.0")).toEqual([StableChannel]);
      expect(channelsOf(overview, "2.0.0")).toEqual([]);
      expect(stableResolution(overview)).toEqual({
        ok: true,
        blockId: a.description.id,
        channel: StableChannel,
      });

      // B stable, reconcile in normal mode. A keeps its own marker (marking is
      // additive per version), so both entries must read stable and resolution
      // must move to the newer version.
      await registry.addPackageToChannel(b.description.id, StableChannel);
      await registry.updateIfNeeded("normal");

      overview = await readKindOverview();
      expect(channelsOf(overview, "1.0.0")).toEqual([StableChannel]);
      expect(channelsOf(overview, "2.0.0")).toEqual([StableChannel]);
      expect(await storage.listFiles(`v2/testorg/kindblk/1.0.0/channels/`)).toEqual([
        StableChannel,
      ]);
      expect(stableResolution(overview)).toEqual({
        ok: true,
        blockId: b.description.id,
        channel: StableChannel,
      });

      // Now the losing side of a real handover: drop stable from A. The version
      // losing membership is the one seeded, so a normal pass must clear its
      // snapshot rather than carry the stale `["stable"]`.
      await registry.removePackageFromChannel(a.description.id, StableChannel);
      await registry.updateIfNeeded("normal");

      overview = await readKindOverview();
      expect(channelsOf(overview, "1.0.0")).toEqual([]);
      expect(channelsOf(overview, "2.0.0")).toEqual([StableChannel]);
      expect(await storage.listFiles(`v2/testorg/kindblk/1.0.0/channels/`)).toEqual([]);
      expect(stableResolution(overview)).toEqual({
        ok: true,
        blockId: b.description.id,
        channel: StableChannel,
      });

      // Dropping the last stable marker must make the kind unresolvable on the
      // stable channel — not silently fall back to a no-longer-stable version.
      await registry.removePackageFromChannel(b.description.id, StableChannel);
      await registry.updateIfNeeded("normal");

      overview = await readKindOverview();
      expect(channelsOf(overview, "1.0.0")).toEqual([]);
      expect(channelsOf(overview, "2.0.0")).toEqual([]);
      expect(stableResolution(overview)).toEqual({
        ok: false,
        reason: "no-stable-implementation",
      });
      expect(resolveKind(overview, "1.0.0", { allowUnstable: true })).toEqual({
        ok: true,
        blockId: b.description.id,
        channel: "any",
      });
    } finally {
      await teardown();
    }
  },
);

test.each([
  {
    name: "test1",
    current: "1.2.3",
    available: ["1.1.2", "1.2.3", "1.2.4", "1.2.5", "1.3.4", "1.3.5", "3.4.1", "3.4.2"],
    expected: [
      { type: "patch", update: "1.2.5" },
      { type: "minor", update: "1.3.5" },
      { type: "major", update: "3.4.2" },
    ],
  },
  {
    name: "test2",
    current: "1.2.3",
    available: ["1.1.2", "1.2.3", "1.3.4", "1.3.5", "3.4.1", "3.4.2"],
    expected: [
      { type: "minor", update: "1.3.5" },
      { type: "major", update: "3.4.2" },
    ],
  },
  {
    name: "test3",
    current: "1.2.3",
    available: ["1.1.2", "1.2.3", "1.2.4", "1.2.5", "3.4.1", "3.4.2"],
    expected: [
      { type: "patch", update: "1.2.5" },
      { type: "major", update: "3.4.2" },
    ],
  },
  {
    name: "test4",
    current: "1.2.3",
    available: ["1.1.2", "1.2.3", "1.2.4", "1.3.0", "2.0.0"],
    expected: [
      { type: "patch", update: "1.2.4" },
      { type: "minor", update: "1.3.0" },
      { type: "major", update: "2.0.0" },
    ],
  },
] as { name: string; current: string; available: string[]; expected: UpdateSuggestions<string> }[])(
  "infer updates test $name",
  ({ current, available, expected }) => {
    const a = [...available];
    a.reverse();
    expect(inferUpdateSuggestions(current, a)).toStrictEqual(expected);
  },
);
