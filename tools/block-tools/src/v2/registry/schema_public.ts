import type { BlockPackId } from "@milaboratories/pl-model-middle-layer";
import {
  AnyChannel,
  BlockPackDescriptionManifest,
  BlockPackIdNoVersion,
  Sha256Schema,
  VersionWithChannels,
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

/**
 * Raw shape parsed from the registry's `overview.json` for one package
 * entry. Older registry files may omit `allVersionsWithChannels` and may
 * lack an `AnyChannel` slot in `latestByChannel`; `normalizeGlobalOverviewEntry`
 * fills both in from the deprecated `allVersions` / `latest` fields.
 */
const GlobalOverviewEntryRawSchema = z
  .object({
    id: BlockPackIdNoVersion,
    /** @deprecated kept for back-compat with older overview files */
    allVersions: z.array(z.string()).optional(),
    allVersionsWithChannels: z.array(VersionWithChannels).optional(),
    /** @deprecated kept for back-compat with older overview files */
    latest: BlockPackDescriptionManifest.optional(),
    /** @deprecated kept for back-compat with older overview files */
    latestManifestSha256: Sha256Schema.optional(),
    latestByChannel: z
      .record(
        z.string(),
        z
          .object({
            description: BlockPackDescriptionManifest,
            manifestSha256: Sha256Schema,
          })
          .passthrough(),
      )
      .default({}),
  })
  .passthrough();

export type GlobalOverviewEntryReg = z.infer<typeof GlobalOverviewEntryRawSchema> & {
  allVersionsWithChannels: z.infer<typeof VersionWithChannels>[];
};

/**
 * Fills in defaults for older `overview.json` shapes after Zod parsing:
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
  parsed: z.infer<typeof GlobalOverviewEntryRawSchema>,
): GlobalOverviewEntryReg {
  const id = `${parsed.id.organization}/${parsed.id.name}`;

  let allVersionsWithChannels = parsed.allVersionsWithChannels;
  if (allVersionsWithChannels === undefined) {
    if (parsed.allVersions === undefined)
      throw new Error(
        `GlobalOverviewEntry ${id} is missing both 'allVersionsWithChannels' and the deprecated 'allVersions' fallback`,
      );
    allVersionsWithChannels = parsed.allVersions.map((v) => ({ version: v, channels: [] }));
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

export type GlobalOverviewReg = {
  schema: "v2";
  packages: GlobalOverviewEntryReg[];
} & { [k: string]: unknown };

/**
 * Parses and normalizes a `GlobalOverviewReg` document read from registry
 * storage. Validation runs through Zod; the back-compat normalization runs
 * after parse as a plain function. The Zod schema is built inside the
 * function (not as a module-level const) to keep TypeScript from emitting
 * the schema's deeply-nested inferred type into the package's `.d.ts`.
 */
export function parseGlobalOverviewReg(raw: unknown): GlobalOverviewReg {
  const schema = z
    .object({
      schema: z.literal("v2"),
      packages: z.array(GlobalOverviewEntryRawSchema),
    })
    .passthrough();
  const parsed = schema.parse(raw);
  return {
    ...parsed,
    packages: parsed.packages.map(normalizeGlobalOverviewEntry),
  };
}
