import {
  BlockPackMeta,
  BlockPackMetaEmbeddedBase64,
  BlockPackMetaEmbeddedBytes,
  ContentAbsoluteBinaryLocal,
  ContentAbsoluteTextLocal,
  ContentRelativeBinary,
  ContentRelativeText,
  DescriptionContentBinary,
  DescriptionContentText
} from '@milaboratories/pl-model-middle-layer';
import {
  absoluteToBase64,
  absoluteToBytes,
  absoluteToString,
  cpAbsoluteToRelative,
  mapLocalToAbsolute,
  RelativeContentReader,
  relativeToContentString,
  relativeToExplicitBytes
} from './content_conversion';
import { z } from 'zod';

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

export const BlockPackMetaEmbedAbsoluteBase64 = BlockPackMeta(
  ContentAbsoluteTextLocal.transform(absoluteToString()),
  ContentAbsoluteBinaryLocal.transform(absoluteToBase64())
).pipe(BlockPackMetaEmbeddedBase64);

export const BlockPackMetaEmbedAbsoluteBytes = BlockPackMeta(
  ContentAbsoluteTextLocal.transform(absoluteToString()),
  ContentAbsoluteBinaryLocal.transform(absoluteToBytes())
).pipe(BlockPackMetaEmbeddedBytes);

export function BlockPackMetaEmbedBytes(reader: RelativeContentReader) {
  return BlockPackMeta(
    ContentRelativeText.transform(relativeToContentString(reader)),
    ContentRelativeBinary.transform(relativeToExplicitBytes(reader))
  ).pipe(BlockPackMetaEmbeddedBytes);
}
