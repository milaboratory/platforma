import {
  BlockPackMeta,
  ContentAbsoluteBinaryLocal,
  ContentAbsoluteTextLocal,
  DescriptionContentBinary,
  DescriptionContentText
} from '@milaboratory/pl-middle-layer-model';
import {
  absoluteToBase64,
  absoluteToString,
  cpAbsoluteToRelative,
  mapLocalToAbsolute
} from './content_conversion';
import { z } from 'zod';
import { BlockPackMetaEmbeddedContent } from '@milaboratory/pl-middle-layer-model';

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
