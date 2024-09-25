import {
  BlockComponentsManifest,
  BlockPackDescriptionManifest,
  BlockPackId,
  BlockPackIdNoVersion,
  BlockPackMeta,
  ContentRelativeBinary,
  ContentRelativeText,
  CreateBlockPackDescriptionSchema
} from '@milaboratories/pl-model-middle-layer';
import { z } from 'zod';
import { RelativeContentReader, relativeToExplicitBytes, relativeToExplicitText } from '../model';

const MainPrefix = 'v2/';

export const ManifestFileName = 'manifest.json';

export function packageContentPrefix(bp: BlockPackId): string {
  return `${MainPrefix}${bp.organization}/${bp.name}/${bp.version}`;
}

export const ManifestSuffix = '/' + ManifestFileName;

// export function payloadFilePath(bp: BlockPackId, file: string): string {
//   return `${MainPrefix}${bp.organization}/${bp.name}/${bp.version}/${file}`;
// }

export const PackageOverview = z.object({
  schema: z.literal('v2'),
  versions: z.array(BlockPackDescriptionManifest)
});
export type PackageOverview = z.infer<typeof PackageOverview>;

export function packageOverviewPath(bp: BlockPackIdNoVersion): string {
  return `${MainPrefix}${bp.organization}/${bp.name}/overview.json`;
}

export const GlobalOverviewPath = `${MainPrefix}overview.json`;

export function GlobalOverviewEntry<const Description extends z.ZodTypeAny>(
  descriptionType: Description
) {
  return z.object({
    id: BlockPackIdNoVersion,
    allVersions: z.array(z.string()),
    latest: descriptionType
  });
}

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

export function GlobalOverviewToExplicitBinaryBytes(reader: RelativeContentReader) {
  return GlobalOverview(
    CreateBlockPackDescriptionSchema(
      BlockComponentsManifest,
      BlockPackMeta(
        ContentRelativeText.transform(relativeToExplicitText(reader)),
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
        ContentRelativeText.transform(relativeToExplicitText(reader)),
        ContentRelativeBinary.transform(relativeToExplicitBytes(reader))
      )
    )
  );
}
export type GlobalOverviewExplicitBinaryBase64 = z.infer<
  ReturnType<typeof GlobalOverviewToExplicitBinaryBase64>
>;
