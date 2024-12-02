import { z } from 'zod';
import {
  BlockPackId,
  BlockPackIdNoVersion,
  BlockPackMetaEmbeddedBytes,
  SemVer
} from '../block_meta';
import { BlockPackSpec } from './block_pack_spec';
import { RegistryEntry } from './registry_spec';

/**
 * Latest information about specific block pack. Contain information about latest version of the package.
 * */
export const BlockPackOverviewLegacy = z.object({
  registryId: z.string(),
  id: BlockPackId,
  meta: BlockPackMetaEmbeddedBytes,
  spec: BlockPackSpec,
  otherVersions: z.array(SemVer)
});
export type BlockPackOverviewLegacy = z.infer<typeof BlockPackOverviewLegacy>;

export const AnyChannel = 'any';
export const StableChannel = 'stable';

export const VersionWithChannels = z.object({
  version: SemVer,
  channels: z.array(z.string())
});

/**
 * Information about specific block pack version.
 * */
export const SingleBlockPackOverview = z.object({
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
  allVersions: z.array(VersionWithChannels),
  registryId: z.string()
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

export function blockPackOverviewToLegacy(bpo: BlockPackOverview): BlockPackOverviewLegacy {
  const mainChannel = bpo.latestByChannel[StableChannel] !== undefined ? StableChannel : AnyChannel;
  const latestOverview = bpo.latestByChannel[mainChannel];
  return {
    id: latestOverview.id,
    meta: latestOverview.meta,
    spec: latestOverview.spec,
    otherVersions: bpo.allVersions
      .filter((v) => v.channels.indexOf(mainChannel) >= 0)
      .map((v) => v.version),
    registryId: bpo.registryId
  };
}
