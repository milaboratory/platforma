import { z } from 'zod';
import {
  BlockPackId,
  BlockPackIdNoVersion,
  BlockPackMetaEmbeddedBytes,
  SemVer
} from '../block_meta';
import { BlockPackSpec } from './block_pack_spec';
import { RegistryEntry } from './registry_spec';

export const AnyChannel = 'any';

export const VersionWithChannels = z.object({
  version: SemVer,
  channels: z.array(z.string())
});

/**
 * Information about specific block pack version.
 * */
export const SingleBlockPackOverview = z.object({
  registryId: z.string(),
  id: BlockPackId,
  meta: BlockPackMetaEmbeddedBytes,
  spec: BlockPackSpec
});
export type SingleBlockPackOverview = z.infer<typeof SingleBlockPackOverview>;

/**
 * Latest information about specific block pack. Contain information about latest version of the package.
 * */
export const BlockPackOverview = z.object({
  id: BlockPackIdNoVersion,
  latestByChannel: z.record(z.string(), SingleBlockPackOverview),
  allVersions: z.array(VersionWithChannels)
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
