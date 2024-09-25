import {
  BlockPackMeta,
  ContentAbsoluteBinaryLocal,
  ContentAbsoluteTextLocal,
  DescriptionContentBinary,
  DescriptionContentText
} from '@milaboratories/pl-model-middle-layer';
import {
  absoluteToBase64,
  absoluteToString,
  cpAbsoluteToRelative,
  mapLocalToAbsolute
} from './content_conversion';
import type { z } from 'zod';
import { BlockPackMetaEmbeddedContent } from '@milaboratories/pl-model-middle-layer';

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

export const BlockPackMetaEmbed = BlockPackMeta(
  ContentAbsoluteTextLocal.transform(absoluteToString()),
  ContentAbsoluteBinaryLocal.transform(absoluteToBase64())
).pipe(BlockPackMetaEmbeddedContent);
export type BlockPackMetaEmbed = z.infer<typeof BlockPackMetaEmbed>;
