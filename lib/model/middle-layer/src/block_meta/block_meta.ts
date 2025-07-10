import { z } from 'zod';
import {
  ContentExplicitBase64,
  ContentExplicitBytes,
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
    changelog: longString.optional(),
    logo: binary.optional(),
    url: z.string().url().optional(),
    docs: z.string().url().optional(),
    support: z.union([z.string().url(), z.string().email()]).optional(),
    tags: z.array(z.string()).optional(),
    organization: z.object({
      name: z.string(),
      url: z.string().url(),
      logo: binary.optional()
    }),
    /**
     * The order of blocks on the "marketplace" (higher values push block higher to the top of the list).
     * `undefined` value or absent field is treated exactly the same as number `0`.
     */
    marketplaceRanking: z.number().optional(),
    /**
     * If true, the block is deprecated and should not be used.
     */
    deprecated: z.boolean().optional(),
    /**
     * The URL to the Terms of Service for the block. If provided checkbox with link to this URL should be shown in order to add block.
     */
    termsOfServiceUrl: z.string().url().optional()
  });
}

// prettier-ignore
export const BlockPackMetaDescriptionRaw = BlockPackMeta(
  DescriptionContentText,
  DescriptionContentBinary
);
export type BlockPackMetaDescriptionRaw = z.infer<typeof BlockPackMetaDescriptionRaw>;

// prettier-ignore
export const BlockPackMetaEmbeddedBase64 = BlockPackMeta(
  z.string(),
  ContentExplicitBase64
);
export type BlockPackMetaEmbeddedBase64 = z.infer<typeof BlockPackMetaEmbeddedBase64>;

// prettier-ignore
export const BlockPackMetaEmbeddedBytes = BlockPackMeta(
  z.string(),
  ContentExplicitBytes
);
export type BlockPackMetaEmbeddedBytes = z.infer<typeof BlockPackMetaEmbeddedBytes>;
