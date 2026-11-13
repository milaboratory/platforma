import type {
  BlockPackDescriptionManifest,
  BlockPackId,
  BlockPackIdNoVersion,
} from "@milaboratories/pl-model-middle-layer";
import { expectTypeOf, test } from "vitest";
import type {
  PlRegCommonConfigData,
  PlRegFullPackageConfigData,
  PlRegPackageConfigDataShard,
} from "./registry_v1/config_schema";
import type {
  GlobalOverviewEntryReg,
  KindImplementer,
  KindManifest,
  KindManifestFileInfo,
  KindManifestIdentity,
  KindOverview,
  KindVersionOverview,
  PackageOverview,
  PackageOverviewVersionEntry,
} from "./v2/registry";

type Loose = { [k: string]: unknown };
type VersionChannels = { version: string; channels: string[] } & Loose;
type LatestEntry = { description: BlockPackDescriptionManifest; manifestSha256: string } & Loose;

test("registry v1 config output types", () => {
  expectTypeOf<PlRegCommonConfigData>().toEqualTypeOf<{
    registries: Record<string, string>;
    registry?: string | undefined;
  }>();
  expectTypeOf<PlRegFullPackageConfigData>().branded.toEqualTypeOf<{
    registries: Record<string, string>;
    registry: string;
    organization: string;
    package: string;
    version: string;
    files: Record<string, string>;
    meta: Loose;
  }>();
  expectTypeOf<PlRegPackageConfigDataShard>().branded.toEqualTypeOf<{
    registries: Record<string, string>;
    registry?: string | undefined;
    organization?: string | undefined;
    package?: string | undefined;
    version?: string | undefined;
    files: Record<string, string>;
    meta?: Loose | undefined;
  }>();
});

test("kind registry output types", () => {
  expectTypeOf<KindManifestIdentity>().toEqualTypeOf<{ name: string; version: string } & Loose>();
  expectTypeOf<KindManifestFileInfo>().toEqualTypeOf<
    { name: string; size: number; sha256: string } & Loose
  >();
  expectTypeOf<KindManifest>().toEqualTypeOf<
    {
      schema: "v1";
      kind: KindManifestIdentity;
      sourceHash: string;
      files: KindManifestFileInfo[];
      timestamp?: number | undefined;
      firstUploadTimestamp?: number | undefined;
    } & Loose
  >();
  expectTypeOf<KindImplementer>().toEqualTypeOf<
    { id: BlockPackId; kindVersion: string; channels: string[] } & Loose
  >();
  expectTypeOf<KindVersionOverview>().toEqualTypeOf<
    { kindVersion: string; latestByChannel: Record<string, BlockPackId> } & Loose
  >();
  expectTypeOf<KindOverview>().toEqualTypeOf<
    { schema: "v1"; implementers: KindImplementer[]; kindVersions: KindVersionOverview[] } & Loose
  >();
});

test("public registry output types", () => {
  expectTypeOf<PackageOverviewVersionEntry>().toEqualTypeOf<
    {
      description: BlockPackDescriptionManifest;
      channels: string[];
      manifestSha256: string;
    } & Loose
  >();
  expectTypeOf<PackageOverview>().toEqualTypeOf<
    { schema: "v2"; versions: PackageOverviewVersionEntry[] } & Loose
  >();
  expectTypeOf<GlobalOverviewEntryReg>().branded.toEqualTypeOf<
    {
      id: BlockPackIdNoVersion;
      allVersions?: string[] | undefined;
      allVersionsWithChannels?: VersionChannels[] | undefined;
      latest?: BlockPackDescriptionManifest | undefined;
      latestManifestSha256?: string | undefined;
      latestByChannel: Record<string, LatestEntry>;
    } & Loose & { allVersionsWithChannels: VersionChannels[] }
  >();
});
