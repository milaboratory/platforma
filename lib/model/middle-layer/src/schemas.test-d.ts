import type {
  BlockCodeKnownFeatureFlags,
  BlockKindReference,
} from "@milaboratories/pl-model-common";
import type * as v from "valibot";
import { expectTypeOf, test } from "vitest";
import type {
  WorkflowV1,
  BlockPackDescriptionManifest,
  BlockPackDescriptionRaw,
  BlockPackDevV1,
  BlockPackDevV2,
  BlockPackFromPackV2,
  BlockPackFromRegistryV1,
  BlockPackFromRegistryV2,
  BlockPackId,
  BlockPackIdNoVersion,
  BlockPackListing,
  BlockPackManifest,
  BlockPackMetaDescriptionRaw,
  BlockPackMetaEmbeddedBase64,
  BlockPackMetaEmbeddedBytes,
  BlockPackMetaManifest,
  BlockPackOverview,
  BlockPackOverviewLegacy,
  BlockPackOverviewNoRegistryId,
  BlockPackSpec,
  BlockPlatform,
  FolderEntry,
  FoldersDocument,
  LocalDevFolder,
  ManifestFileInfo,
  RegistryEntry,
  RegistryList,
  RegistrySpec,
  RegistryStatus,
  RemoteRegistryV1Spec,
  RemoteRegistryV2Spec,
  SingleBlockPackOverview,
} from "./index";
import * as schemas from "./index";

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

type Loose = { [k: string]: unknown };
type Id = { organization: string; name: string; version: string };
type IdNoVersion = { organization: string; name: string };
type ExplicitString = { type: "explicit-string"; content: string };
type ExplicitBase64 = { type: "explicit-base64"; mimeType: string; content: string };
type ExplicitBytes = { type: "explicit-bytes"; mimeType: string; content: Uint8Array<ArrayBuffer> };
type Relative = { type: "relative"; path: string };
type AbsoluteFile = { type: "absolute-file"; file: string };
type Platform =
  | "windows-x64"
  | "windows-aarch64"
  | "macosx-x64"
  | "macosx-aarch64"
  | "linux-x64"
  | "linux-aarch64";
type Meta<LongString, Binary> = {
  title: string;
  description: string;
  longDescription?: LongString | undefined;
  changelog?: LongString | undefined;
  logo?: Binary | undefined;
  url?: string | undefined;
  docs?: string | undefined;
  support?: string | undefined;
  tags?: string[] | undefined;
  organization: { name: string; url: string; logo?: Binary | undefined } & Loose;
  marketplaceRanking?: number | undefined;
  deprecated?: boolean | undefined;
  termsOfServiceUrl?: string | undefined;
  supportedPlatforms?: Platform[] | undefined;
  requiredCapabilities?: string[] | undefined;
} & Loose;
type Description<Components, MetaType> = {
  id: Id;
  components: Components;
  meta: MetaType;
  featureFlags?: BlockCodeKnownFeatureFlags | undefined;
  kind?: BlockKindReference | undefined;
} & Loose;
type ComponentsRaw = {
  workflow: WorkflowV1<string> | { type: "workflow-v1"; main: string };
  model: string;
  ui: string;
};
type ComponentsManifest = {
  workflow: { type: "workflow-v1"; main: Relative };
  model: Relative;
  ui: Relative;
};
type MetaRaw = Meta<
  ExplicitString | Relative | AbsoluteFile,
  ExplicitBase64 | Relative | AbsoluteFile
>;
type MetaManifest = Meta<ExplicitString | Relative, ExplicitBase64 | Relative>;
type MetaBytes = Meta<string, ExplicitBytes>;
type DescriptionManifest = Description<ComponentsManifest, MetaManifest>;
type FileInfo = { name: string; size: number; sha256: string };
type DevV1 = { type: "dev-v1"; folder: string; mtime?: string | undefined };
type DevV2 = { type: "dev-v2"; folder: string; mtime?: string | undefined };
type FromPackV2 = {
  type: "from-pack-v2";
  packUrl: string;
  rootUrl?: string | undefined;
  mtime?: string | undefined;
};
type FromRegistryV1 = { type: "from-registry-v1"; registryUrl: string; id: Id };
type FromRegistryV2 = {
  type: "from-registry-v2";
  registryUrl: string;
  id: Id;
  channel?: string | undefined;
};
type Spec = DevV1 | DevV2 | FromPackV2 | FromRegistryV1 | FromRegistryV2;
type VersionChannels = { version: string; channels: string[] } & Loose;
type Single = {
  id: Id;
  meta: MetaBytes;
  featureFlags?: BlockCodeKnownFeatureFlags | undefined;
  spec: Spec;
} & Loose;
type OverviewNoRegistryId = {
  id: IdNoVersion;
  latestByChannel: Record<string, Single>;
  allVersions: VersionChannels[];
};
type Overview = OverviewNoRegistryId & { registryId: string };
type LocalDev = { type: "local-dev"; path: string };
type RemoteV1 = { type: "remote-v1"; url: string };
type RemoteV2 = { type: "remote-v2"; url: string };
type Entry = { id: string; title?: string | undefined; spec: RemoteV1 | RemoteV2 | LocalDev };
type Status = {
  id: string;
  title?: string | undefined;
  spec: RemoteV1 | RemoteV2 | LocalDev;
  status: "online" | "offline";
};

test("block meta output types", () => {
  expectTypeOf<Out<typeof schemas.SemVer>>().toEqualTypeOf<string>();
  expectTypeOf<BlockPackId>().toEqualTypeOf<Id>();
  expectTypeOf<Out<typeof schemas.BlockPackId>>().toEqualTypeOf<Id>();
  expectTypeOf<BlockPackIdNoVersion>().toEqualTypeOf<IdNoVersion>();
  expectTypeOf<Out<typeof schemas.ContentExplicitBase64>>().toEqualTypeOf<ExplicitBase64>();
  expectTypeOf<Out<typeof schemas.ContentExplicitBytes>>().toEqualTypeOf<ExplicitBytes>();
  expectTypeOf<Out<typeof schemas.ContentRelative>>().toEqualTypeOf<Relative>();
  expectTypeOf<Out<typeof schemas.ContentRelativeBinary>>().toEqualTypeOf<
    ExplicitBase64 | Relative
  >();
  expectTypeOf<Out<typeof schemas.ContentRelativeText>>().toEqualTypeOf<
    ExplicitString | Relative
  >();
  expectTypeOf<Out<typeof schemas.DescriptionContentBinary>>().toEqualTypeOf<
    ExplicitBase64 | Relative | AbsoluteFile
  >();
  expectTypeOf<Out<typeof schemas.DescriptionContentText>>().toEqualTypeOf<
    ExplicitString | Relative | AbsoluteFile
  >();
  expectTypeOf<BlockPlatform>().toEqualTypeOf<Platform>();
  expectTypeOf<BlockPackMetaDescriptionRaw>().toEqualTypeOf<MetaRaw>();
  expectTypeOf<BlockPackMetaEmbeddedBase64>().toEqualTypeOf<Meta<string, ExplicitBase64>>();
  expectTypeOf<BlockPackMetaEmbeddedBytes>().toEqualTypeOf<MetaBytes>();
  expectTypeOf<BlockPackMetaManifest>().toEqualTypeOf<MetaManifest>();
  expectTypeOf<Out<typeof schemas.BlockComponentsDescriptionRaw>>().toEqualTypeOf<ComponentsRaw>();
  expectTypeOf<Out<typeof schemas.BlockComponentsManifest>>().toEqualTypeOf<ComponentsManifest>();
  expectTypeOf<Out<typeof schemas.BlockPackDescriptionFromPackageJsonRaw>>().toEqualTypeOf<{
    components: ComponentsRaw;
    meta: MetaRaw;
  }>();
  expectTypeOf<Out<typeof schemas.FeatureFlags>>().toEqualTypeOf<BlockCodeKnownFeatureFlags>();
  expectTypeOf<Out<typeof schemas.BlockKindRef>>().toEqualTypeOf<BlockKindReference>();
  expectTypeOf<BlockPackDescriptionRaw>().toEqualTypeOf<Description<ComponentsRaw, MetaRaw>>();
  expectTypeOf<BlockPackDescriptionManifest>().toEqualTypeOf<DescriptionManifest>();
  expectTypeOf<Out<typeof schemas.Sha256Schema>>().toEqualTypeOf<string>();
  expectTypeOf<ManifestFileInfo>().toEqualTypeOf<FileInfo>();
  expectTypeOf<BlockPackManifest>().toEqualTypeOf<
    {
      schema: "v2";
      description: DescriptionManifest;
      timestamp?: number | undefined;
      files: FileInfo[];
    } & Loose
  >();
});

test("schema factory output types", () => {
  const workflow = schemas.WorkflowSchemaV1(schemas.ContentRelative);
  expectTypeOf<Out<typeof workflow>>().toEqualTypeOf<{ type: "workflow-v1"; main: Relative }>();
  const meta = schemas.BlockPackMeta(schemas.ContentRelative, schemas.ContentExplicitBase64);
  expectTypeOf<Out<typeof meta>>().toEqualTypeOf<Meta<Relative, ExplicitBase64>>();
  const description = schemas.CreateBlockPackDescriptionSchema(
    schemas.BlockComponentsManifest,
    schemas.ContentRelative,
  );
  expectTypeOf<Out<typeof description>>().toEqualTypeOf<
    Description<ComponentsManifest, Relative>
  >();
});

test("block registry output types", () => {
  expectTypeOf<BlockPackDevV1>().toEqualTypeOf<DevV1>();
  expectTypeOf<BlockPackDevV2>().toEqualTypeOf<DevV2>();
  expectTypeOf<BlockPackFromPackV2>().toEqualTypeOf<FromPackV2>();
  expectTypeOf<BlockPackFromRegistryV1>().toEqualTypeOf<FromRegistryV1>();
  expectTypeOf<BlockPackFromRegistryV2>().toEqualTypeOf<FromRegistryV2>();
  expectTypeOf<BlockPackSpec>().toEqualTypeOf<Spec>();
  expectTypeOf<BlockPackOverviewLegacy>().toEqualTypeOf<
    { registryId: string; id: Id; meta: MetaBytes; spec: Spec; otherVersions: string[] } & Loose
  >();
  expectTypeOf<Out<typeof schemas.VersionWithChannels>>().toEqualTypeOf<VersionChannels>();
  expectTypeOf<SingleBlockPackOverview>().toEqualTypeOf<Single>();
  expectTypeOf<Out<typeof schemas.BlockPackOverviewRaw>>().branded.toEqualTypeOf<Overview>();
  expectTypeOf<BlockPackOverview>().branded.toEqualTypeOf<Overview & Loose>();
  expectTypeOf<BlockPackOverviewNoRegistryId>().branded.toEqualTypeOf<
    OverviewNoRegistryId & Loose
  >();
  expectTypeOf<LocalDevFolder>().toEqualTypeOf<LocalDev>();
  expectTypeOf<RemoteRegistryV1Spec>().toEqualTypeOf<RemoteV1>();
  expectTypeOf<RemoteRegistryV2Spec>().toEqualTypeOf<RemoteV2>();
  expectTypeOf<RegistrySpec>().toEqualTypeOf<RemoteV1 | RemoteV2 | LocalDev>();
  expectTypeOf<RegistryEntry>().toEqualTypeOf<Entry>();
  expectTypeOf<RegistryList>().toEqualTypeOf<Entry[]>();
  expectTypeOf<RegistryStatus>().toEqualTypeOf<Status>();
  expectTypeOf<BlockPackListing>().branded.toEqualTypeOf<{
    registries: Status[];
    blockPacks: (Overview & Loose)[];
  }>();
});

test("folder document output types", () => {
  expectTypeOf<Out<typeof schemas.FolderEntry>>().toEqualTypeOf<FolderEntry>();
  expectTypeOf<Out<typeof schemas.FoldersDocument>>().toEqualTypeOf<FoldersDocument>();
});
