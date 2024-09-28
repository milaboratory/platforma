import { z } from 'zod';
import { BlockPackId, BlockPackMetaEmbeddedBytes, SemVer } from '../block_meta';
import { BlockPackSpec } from './block_pack_spec';
import { RegistryEntry } from './registry_spec';

/**
 * Latest information about specific block pack. Contain information about latest version of the package.
 * */
export const BlockPackOverview = z.object({
  registryId: z.string(),
  id: BlockPackId,
  meta: BlockPackMetaEmbeddedBytes,
  spec: BlockPackSpec,
  otherVersions: z.array(SemVer)
});
export type BlockPackOverview = z.infer<typeof BlockPackOverview>;

export const RegistryStatus = RegistryEntry.extend({
  status: z.union([z.literal('online'), z.literal('offline')])
});
export type RegistryStatus = z.infer<typeof RegistryStatus>;

export const BlockPackListing = z.object({
  registries: z.array(RegistryStatus),
  blockPacks: z.array(BlockPackOverview)
});
export type BlockPackListing = z.infer<typeof BlockPackListing>;
