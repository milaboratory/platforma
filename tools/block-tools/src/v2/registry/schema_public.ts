import {
  AnyChannel,
  BlockComponentsManifest,
  BlockPackDescriptionManifest,
  BlockPackId,
  BlockPackIdNoVersion,
  BlockPackMeta,
  ContentRelativeBinary,
  ContentRelativeText,
  CreateBlockPackDescriptionSchema,
  SemVer,
  Sha256Schema,
  VersionWithChannels
} from '@milaboratories/pl-model-middle-layer';
import { z } from 'zod';
import { RelativeContentReader, relativeToExplicitBytes, relativeToExplicitString } from '../model';

export const MainPrefix = 'v2/';

export const GlobalOverviewFileName = 'overview.json';
export const PackageOverviewFileName = 'overview.json';
export const ManifestFileName = 'manifest.json';

export const ChannelsFolder = 'channels';

export const ChannelNameRegexp = /^[-a-z0-9]+$/;

export function packageContentPrefixInsideV2(bp: BlockPackId): string {
  return `${bp.organization}/${bp.name}/${bp.version}`;
}

export function packageContentPrefix(bp: BlockPackId): string {
  return `${MainPrefix}${packageContentPrefixInsideV2(bp)}`;
}

export const ManifestSuffix = '/' + ManifestFileName;

// export function payloadFilePath(bp: BlockPackId, file: string): string {
//   return `${MainPrefix}${bp.organization}/${bp.name}/${bp.version}/${file}`;
// }

export const PackageOverviewVersionEntry = z.object({
  description: BlockPackDescriptionManifest,
  channels: z.array(z.string()).default(() => []),
  manifestSha256: Sha256Schema
});
export type PackageOverviewVersionEntry = z.infer<typeof PackageOverviewVersionEntry>;

export const PackageOverview = z.object({
  schema: z.literal('v2'),
  versions: z.array(PackageOverviewVersionEntry)
});
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
  /(?<packageKeyWithoutVersion>(?<organization>[^\/]+)\/(?<name>[^\/]+))\/(?<version>[^\/]+)\/manifest\.json$/;

export const GlobalOverviewPath = `${MainPrefix}${GlobalOverviewFileName}`;

export function GlobalOverviewEntry<const Description extends z.ZodTypeAny>(
  descriptionType: Description
) {
  const universalSchema = z.object({
    id: BlockPackIdNoVersion,
    /** @deprecated to be removed at some point, not used, left for compatibility with older versions */
    allVersions: z.array(z.string()).optional(),
    allVersionsWithChannels: z.array(VersionWithChannels).optional(),
    /** @deprecated to be removed at some point, not used, left for compatibility with older versions */
    latest: descriptionType,
    /** @deprecated to be removed at some point, not used, left for compatibility with older versions */
    latestManifestSha256: Sha256Schema,
    latestByChannel: z
      .record(
        z.string(),
        z.object({
          description: descriptionType,
          manifestSha256: Sha256Schema
        })
      )
      .default({})
  });
  return (
    universalSchema
      .transform((o) => {
        if (o.allVersionsWithChannels) return o;
        else
          return {
            ...o,
            allVersionsWithChannels: o.allVersions!.map((v) => ({ version: v, channels: [] }))
          };
      })
      // make sure "any" channel set from main body
      .transform((o) =>
        o.latestByChannel[AnyChannel]
          ? o
          : {
              ...o,
              latestByChannel: {
                ...o.latestByChannel,
                [AnyChannel]: { description: o.latest!, manifestSha256: o.latestManifestSha256! }
              }
            }
      )
      .pipe(universalSchema.required({ allVersionsWithChannels: true }))
  );
}
export const GlobalOverviewEntryReg = GlobalOverviewEntry(BlockPackDescriptionManifest);
export type GlobalOverviewEntryReg = z.infer<typeof GlobalOverviewEntryReg>;

export function GlobalOverview<const Description extends z.ZodTypeAny>(
  descriptionType: Description
) {
  return z.object({
    schema: z.literal('v2'),
    packages: z.array(GlobalOverviewEntry(descriptionType))
  });
}

export const GlobalOverviewReg = GlobalOverview(BlockPackDescriptionManifest);
export type GlobalOverviewReg = z.infer<typeof GlobalOverviewReg>;

export function BlockDescriptionToExplicitBinaryBytes(reader: RelativeContentReader) {
  return CreateBlockPackDescriptionSchema(
    BlockComponentsManifest,
    BlockPackMeta(
      ContentRelativeText.transform(relativeToExplicitString(reader)),
      ContentRelativeBinary.transform(relativeToExplicitBytes(reader))
    )
  );
}
export function GlobalOverviewToExplicitBinaryBytes(reader: RelativeContentReader) {
  return GlobalOverview(
    CreateBlockPackDescriptionSchema(
      BlockComponentsManifest,
      BlockPackMeta(
        ContentRelativeText.transform(relativeToExplicitString(reader)),
        ContentRelativeBinary.transform(relativeToExplicitBytes(reader))
      )
    )
  );
}
export type GlobalOverviewExplicitBinaryBytes = z.infer<
  ReturnType<typeof GlobalOverviewToExplicitBinaryBytes>
>;

export function GlobalOverviewToExplicitBinaryBase64(reader: RelativeContentReader) {
  return GlobalOverview(
    CreateBlockPackDescriptionSchema(
      BlockComponentsManifest,
      BlockPackMeta(
        ContentRelativeText.transform(relativeToExplicitString(reader)),
        ContentRelativeBinary.transform(relativeToExplicitBytes(reader))
      )
    )
  );
}
export type GlobalOverviewExplicitBinaryBase64 = z.infer<
  ReturnType<typeof GlobalOverviewToExplicitBinaryBase64>
>;
