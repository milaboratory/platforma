import type { BlockPackId } from "@milaboratories/pl-model-middle-layer";
import {
  AnyChannel,
  BlockPackDescriptionManifest,
  BlockPackIdNoVersion,
  Sha256Schema,
  VersionWithChannels,
} from "@milaboratories/pl-model-middle-layer";
import * as v from "valibot";

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

export const PackageOverviewVersionEntry = v.looseObject({
  description: BlockPackDescriptionManifest,
  channels: v.optional(v.array(v.string()), () => []),
  manifestSha256: Sha256Schema,
});
export type PackageOverviewVersionEntry = v.InferOutput<typeof PackageOverviewVersionEntry>;

export const PackageOverview = v.looseObject({
  schema: v.literal("v2"),
  versions: v.array(PackageOverviewVersionEntry),
});
export type PackageOverview = v.InferOutput<typeof PackageOverview>;

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

/**
 * Raw shape parsed from the registry's `overview.json` for one package
 * entry. Older registry files may omit `allVersionsWithChannels` and may
 * lack an `AnyChannel` slot in `latestByChannel`; `normalizeGlobalOverviewEntry`
 * fills both in from the deprecated `allVersions` / `latest` fields.
 */
const GlobalOverviewEntryRawSchema = v.looseObject({
  id: BlockPackIdNoVersion,
  /** @deprecated kept for back-compat with older overview files */
  allVersions: v.optional(v.array(v.string())),
  allVersionsWithChannels: v.optional(v.array(VersionWithChannels)),
  /** @deprecated kept for back-compat with older overview files */
  latest: v.optional(BlockPackDescriptionManifest),
  /** @deprecated kept for back-compat with older overview files */
  latestManifestSha256: v.optional(Sha256Schema),
  latestByChannel: v.optional(
    v.record(
      v.string(),
      v.looseObject({
        description: BlockPackDescriptionManifest,
        manifestSha256: Sha256Schema,
      }),
    ),
    {},
  ),
});

export type GlobalOverviewEntryReg = v.InferOutput<typeof GlobalOverviewEntryRawSchema> & {
  allVersionsWithChannels: v.InferOutput<typeof VersionWithChannels>[];
};

/**
 * Fills in defaults for older `overview.json` shapes after schema parsing:
 *   - Derives `allVersionsWithChannels` from deprecated `allVersions` when missing.
 *   - Ensures `latestByChannel[AnyChannel]` is populated from the deprecated
 *     `latest` / `latestManifestSha256` fields.
 *
 * When neither the new field nor its deprecated fallback is present we
 * throw with a precise message rather than dragging the failure into a
 * downstream non-null assertion. The registry writer always populates both
 * the new and deprecated fields; this guard catches hand-written or
 * partially-migrated overview files.
 */
function normalizeGlobalOverviewEntry(
  parsed: v.InferOutput<typeof GlobalOverviewEntryRawSchema>,
): GlobalOverviewEntryReg {
  const id = `${parsed.id.organization}/${parsed.id.name}`;

  let allVersionsWithChannels = parsed.allVersionsWithChannels;
  if (allVersionsWithChannels === undefined) {
    if (parsed.allVersions === undefined)
      throw new Error(
        `GlobalOverviewEntry ${id} is missing both 'allVersionsWithChannels' and the deprecated 'allVersions' fallback`,
      );
    allVersionsWithChannels = parsed.allVersions.map((version) => ({ version, channels: [] }));
  }

  let latestByChannel = parsed.latestByChannel;
  if (!latestByChannel[AnyChannel]) {
    if (parsed.latest === undefined || parsed.latestManifestSha256 === undefined)
      throw new Error(
        `GlobalOverviewEntry ${id} is missing the 'latestByChannel[any]' slot and the deprecated 'latest'/'latestManifestSha256' fallback`,
      );
    latestByChannel = {
      ...latestByChannel,
      [AnyChannel]: {
        description: parsed.latest,
        manifestSha256: parsed.latestManifestSha256,
      },
    };
  }

  return {
    ...parsed,
    allVersionsWithChannels,
    latestByChannel,
  };
}

/**
 * Parsed-and-normalized registry overview document. Forward-compat: the
 * underlying schema is a `v.looseObject`, so future top-level fields survive
 * parse/round-trip; the TS type lists only known fields.
 */
export type GlobalOverviewReg = {
  schema: "v2";
  packages: GlobalOverviewEntryReg[];
};

const GlobalOverviewRegRawSchema = v.looseObject({
  schema: v.literal("v2"),
  packages: v.array(GlobalOverviewEntryRawSchema),
});

/**
 * Parses and normalizes a `GlobalOverviewReg` document read from registry
 * storage. Validation runs through valibot and throws a `ValiError` on a
 * malformed document; the back-compat normalization runs after parse as a
 * plain function (see `normalizeGlobalOverviewEntry`).
 */
export function parseGlobalOverviewReg(raw: unknown): GlobalOverviewReg {
  const parsed = v.parse(GlobalOverviewRegRawSchema, raw);
  return {
    ...parsed,
    packages: parsed.packages.map(normalizeGlobalOverviewEntry),
  };
}
