import { z } from 'zod';
import {
  ContentAbsoluteBinaryLocal,
  ContentAbsoluteTextLocal,
  ContentExplicitBase64,
  ContentExplicitString,
  ContentRelative,
  ContentRelativeBinary,
  ContentRelativeText,
  DescriptionContentBinary,
  DescriptionContentText
} from './content_types';

export function BlockPackMeta<
  const LongStringType extends z.ZodTypeAny,
  const BinaryType extends z.ZodTypeAny
>(longString: LongStringType, binary: BinaryType) {
  return z.object({
    title: z.string(),
    description: z.string(),
    longDescription: longString.optional(),
    logo: binary.optional(),
    url: z.string().url().optional(),
    docs: z.string().url().optional(),
    support: z.union([z.string().url(), z.string().email()]).optional(),
    tags: z.array(z.string()).optional(),
    organization: z.object({
      name: z.string(),
      url: z.string().url(),
      logo: binary.optional()
    })
  });
}

// prettier-ignore
export const BlockPackMetaDescriptionRaw = BlockPackMeta(
  DescriptionContentText,
  DescriptionContentBinary
);
export type BlockPackMetaDescriptionRaw = z.infer<typeof BlockPackMetaDescriptionRaw>;

// prettier-ignore
// export const BlockPackMetaManifest = BlockPackMeta(
//   z.string(),
//   ContentExplicitBase64
// );
export const BlockPackMetaManifest = BlockPackMeta(
  ContentRelativeText,
  ContentRelativeBinary
);
export type BlockPackMetaManifest = z.infer<typeof BlockPackMetaManifest>;
