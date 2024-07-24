import { title } from 'process';
import { z } from 'zod';
import {
  DescriptionContentBinary,
  DescriptionContentStirng,
  ManifestContentBinary,
  ManifestContentString
} from './content_types';
import { mapLocalToAbsolute } from './content_conversion';

function BlockPackMeta<
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
  DescriptionContentStirng,
  DescriptionContentBinary
);
export type BlockPackMetaDescriptionRaw = z.infer<typeof BlockPackMetaDescriptionRaw>;
export function BlockPackMetaDescription(root: string) {
  return BlockPackMeta(
    DescriptionContentStirng.transform(mapLocalToAbsolute(root)),
    DescriptionContentBinary.transform(mapLocalToAbsolute(root))
  );
}
export type BlockPackMetaDescription = z.infer<ReturnType<typeof BlockPackMetaDescription>>;

// prettier-ignore
export const BlockPackMetaManifest = BlockPackMeta(
    ManifestContentString,
    ManifestContentBinary
);
export type BlockPackMetaManifest = z.infer<typeof BlockPackMetaManifest>;
