import type { BlockPackId, BlockPackIdNoVersion } from "@milaboratories/pl-model-middle-layer";
import {
  AnyChannel,
  BlockPackDescriptionManifest,
  Sha256Schema,
} from "@milaboratories/pl-model-middle-layer";
import { z } from "zod";

export const MainPrefix = "v2/";

export const GlobalOverviewFileName = "overview.json";
export const GlobalOverviewGzFileName = "overview.json.gz";
export const PackageOverviewFileName = "overview.json";
export const ManifestFileName = "manifest.json";

export const ChannelsFolder = "channels";

export const ChannelNameRegexp = /^[-a-z0-9]+$/;

export function packageContentPrefixInsideV2(bp: BlockPackId): string {
  return `${bp.organization}/${bp.name}/${bp.version}`;
}

export function packageContentPrefix(bp: BlockPackId): string {
  return `${MainPrefix}${packageContentPrefixInsideV2(bp)}`;
}

export const ManifestSuffix = "/" + ManifestFileName;

// export function payloadFilePath(bp: BlockPackId, file: string): string {
//   return `${MainPrefix}${bp.organization}/${bp.name}/${bp.version}/${file}`;
// }

export const PackageOverviewVersionEntry = z
  .object({
    description: BlockPackDescriptionManifest,
    channels: z.array(z.string()).default(() => []),
    manifestSha256: Sha256Schema,
  })
  .passthrough();
export type PackageOverviewVersionEntry = z.infer<typeof PackageOverviewVersionEntry>;

export const PackageOverview = z
  .object({
    schema: z.literal("v2"),
    versions: z.array(PackageOverviewVersionEntry),
  })
  .passthrough();
export type PackageOverview = z.infer<typeof PackageOverview>;

export function packageOverviewPathInsideV2(bp: BlockPackIdNoVersion): string {
  return `${bp.organization}/${bp.name}/${PackageOverviewFileName}`;
}

export function packageOverviewPath(bp: BlockPackIdNoVersion): string {
  return `${MainPrefix}${packageOverviewPathInsideV2(bp)}`;
}

export function packageChannelPrefixInsideV2(bp: BlockPackId): string {
  return `${packageContentPrefixInsideV2(bp)}/${ChannelsFolder}/`;
}

export function packageChannelPrefix(bp: BlockPackId): string {
  return `${MainPrefix}${packageChannelPrefixInsideV2(bp)}`;
}

export const PackageManifestPattern =
  /(?<packageKeyWithoutVersion>(?<organization>[^/]+)\/(?<name>[^/]+))\/(?<version>[^/]+)\/manifest\.json$/;

export const GlobalOverviewPath = `${MainPrefix}${GlobalOverviewFileName}`;
export const GlobalOverviewGzPath = `${MainPrefix}${GlobalOverviewGzFileName}`;

export type VersionWithChannels = {
  version: string;
  channels: string[];
};

export type GlobalOverviewEntry<D> = {
  id: BlockPackIdNoVersion;
  /** @deprecated left for compatibility with older versions */
  allVersions?: string[];
  allVersionsWithChannels: VersionWithChannels[];
  /** @deprecated left for compatibility with older versions */
  latest: D;
  /** @deprecated left for compatibility with older versions */
  latestManifestSha256: string;
  latestByChannel: Record<string, { description: D; manifestSha256: string }>;
};

export type GlobalOverview<D> = {
  schema: "v2";
  packages: GlobalOverviewEntry<D>[];
};

export type GlobalOverviewEntryReg = GlobalOverviewEntry<BlockPackDescriptionManifest>;
export type GlobalOverviewReg = GlobalOverview<BlockPackDescriptionManifest>;

function migrateGlobalOverviewEntry<D>(raw: unknown): GlobalOverviewEntry<D> {
  if (!raw || typeof raw !== "object")
    throw new Error(`Invalid global overview entry: ${JSON.stringify(raw)}`);
  const o = raw as Record<string, unknown> & Partial<GlobalOverviewEntry<D>>;
  const allVersionsWithChannels =
    o.allVersionsWithChannels ?? (o.allVersions ?? []).map((v) => ({ version: v, channels: [] }));
  const latestByChannel = { ...(o.latestByChannel ?? {}) };
  if (!latestByChannel[AnyChannel] && o.latest !== undefined && o.latestManifestSha256) {
    latestByChannel[AnyChannel] = {
      description: o.latest as D,
      manifestSha256: o.latestManifestSha256,
    };
  }
  return {
    ...o,
    id: o.id as BlockPackIdNoVersion,
    allVersionsWithChannels,
    latest: o.latest as D,
    latestManifestSha256: (o.latestManifestSha256 ?? "") as string,
    latestByChannel,
  };
}

export function parseGlobalOverviewReg(raw: unknown): GlobalOverviewReg {
  if (!raw || typeof raw !== "object" || (raw as { schema?: unknown }).schema !== "v2")
    throw new Error(`Invalid global overview: schema != "v2"`);
  const o = raw as { schema: "v2"; packages?: unknown[] };
  const packages = (o.packages ?? []).map((p) =>
    migrateGlobalOverviewEntry<BlockPackDescriptionManifest>(p),
  );
  return { schema: "v2", packages };
}
