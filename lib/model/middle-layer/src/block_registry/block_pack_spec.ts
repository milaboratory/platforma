import { z } from 'zod';
import { BlockPackId } from '../block_meta';

/** Block pack from local folder, to be used during block development. Old layout.
 * @deprecated don't use */
export const BlockPackDevV1 = z.object({
  type: z.literal('dev-v1'),
  folder: z.string(),
  mtime: z.string().optional()
});
/** @deprecated don't use */
export type BlockPackDevV1 = z.infer<typeof BlockPackDevV1>;

/** Block pack from local folder, to be used during block development. New layout. */
export const BlockPackDevV2 = z.object({
  type: z.literal('dev-v2'),
  folder: z.string(),
  mtime: z.string().optional()
});
export type BlockPackDevV2 = z.infer<typeof BlockPackDevV2>;

/**
 * Block pack from registry with version 2 layout, to be loaded directly
 * from the client.
 * @deprecated don't use
 * */
export const BlockPackFromRegistryV1 = z.object({
  type: z.literal('from-registry-v1'),
  registryUrl: z.string(),
  id: BlockPackId
});
/** @deprecated don't use */
export type BlockPackFromRegistryV1 = z.infer<typeof BlockPackFromRegistryV1>;

/** Block pack from registry with version 2 layout, to be loaded directly
 * from the client. */
export const BlockPackFromRegistryV2 = z.object({
  type: z.literal('from-registry-v2'),
  registryUrl: z.string(),
  id: BlockPackId
});
export type BlockPackFromRegistryV2 = z.infer<typeof BlockPackFromRegistryV2>;

/** Information about block origin, can be used to instantiate new blocks */
export const BlockPackSpec = z.discriminatedUnion('type', [
  BlockPackDevV1,
  BlockPackDevV2,
  BlockPackFromRegistryV1,
  BlockPackFromRegistryV2
]);
export type BlockPackSpec = z.infer<typeof BlockPackSpec>;
