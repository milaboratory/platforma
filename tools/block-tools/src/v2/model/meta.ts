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
import {
  mapLocalToAbsolute,
  cpAbsoluteToRelative,
  mapRemoteToAbsolute,
  absoluteToString,
  absoluteToBase64
} from './content_conversion';

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
  DescriptionContentText,
  DescriptionContentBinary
);
export type BlockPackMetaDescriptionRaw = z.infer<typeof BlockPackMetaDescriptionRaw>;

export function BlockPackMetaDescription(root: string) {
  return BlockPackMeta(
    DescriptionContentText.transform(mapLocalToAbsolute(root)),
    DescriptionContentBinary.transform(mapLocalToAbsolute(root))
  );
}
export type BlockPackMetaDescription = z.infer<ReturnType<typeof BlockPackMetaDescription>>;

export function BlockPackMetaConsolidate(dstFolder: string, fileAccumulator?: string[]) {
  return BlockPackMeta(
    ContentAbsoluteTextLocal.transform(cpAbsoluteToRelative(dstFolder, fileAccumulator)),
    ContentAbsoluteBinaryLocal.transform(cpAbsoluteToRelative(dstFolder, fileAccumulator))
  );
}

export function BlockPackMetaToAbsolute(prefix: string) {
  return BlockPackMeta(
    ContentRelativeText.transform(mapRemoteToAbsolute(prefix)),
    ContentRelativeBinary.transform(mapRemoteToAbsolute(prefix))
  );
}

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

export const BlockPackMetaToExplicit = BlockPackMeta(
  ContentAbsoluteTextLocal.transform(absoluteToString()),
  ContentAbsoluteBinaryLocal.transform(absoluteToBase64())
).pipe(BlockPackMetaManifest);
