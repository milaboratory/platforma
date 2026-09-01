import * as v from "valibot";
import {
  BlockPackId,
  BlockPackIdNoVersion,
  BlockPackMetaEmbeddedBytes,
  FeatureFlags,
  SemVer,
} from "../block_meta";
import type { BlockPackFromRegistryV2 } from "./block_pack_spec";
import { BlockPackSpec } from "./block_pack_spec";
import { RegistryEntry } from "./registry_spec";

/**
 * Latest information about specific block pack. Contain information about latest version of the package.
 * */
export const BlockPackOverviewLegacy = v.looseObject({
  registryId: v.string(),
  id: BlockPackId,
  meta: BlockPackMetaEmbeddedBytes,
  spec: BlockPackSpec,
  otherVersions: v.array(SemVer),
});
export type BlockPackOverviewLegacy = v.InferOutput<typeof BlockPackOverviewLegacy>;

export const AnyChannel = "any";
export const StableChannel = "stable";

export const VersionWithChannels = v.looseObject({
  version: SemVer,
  channels: v.array(v.string()),
});

/**
 * Information about specific block pack version.
 * */
export const SingleBlockPackOverview = v.looseObject({
  id: BlockPackId,
  meta: BlockPackMetaEmbeddedBytes,
  featureFlags: v.optional(FeatureFlags),
  spec: BlockPackSpec,
});
export type SingleBlockPackOverview = v.InferOutput<typeof SingleBlockPackOverview>;

/**
 * Latest information about specific block pack. Contain information about latest version of the package.
 * */
export const BlockPackOverviewRaw = v.object({
  id: BlockPackIdNoVersion,
  latestByChannel: v.record(v.string(), SingleBlockPackOverview),
  allVersions: v.array(VersionWithChannels),
  registryId: v.string(),
});
export const BlockPackOverview = v.looseObject(BlockPackOverviewRaw.entries);
export type BlockPackOverview = v.InferOutput<typeof BlockPackOverview>;

export const BlockPackOverviewNoRegistryId = v.looseObject(
  v.omit(BlockPackOverviewRaw, ["registryId"]).entries,
);
export type BlockPackOverviewNoRegistryId = v.InferOutput<typeof BlockPackOverviewNoRegistryId>;

export const RegistryStatus = v.object({
  ...RegistryEntry.entries,
  status: v.union([v.literal("online"), v.literal("offline")]),
});
export type RegistryStatus = v.InferOutput<typeof RegistryStatus>;

export const BlockPackListing = v.object({
  registries: v.array(RegistryStatus),
  blockPacks: v.array(BlockPackOverview),
});
export type BlockPackListing = v.InferOutput<typeof BlockPackListing>;

export function blockPackOverviewToLegacy(bpo: BlockPackOverview): BlockPackOverviewLegacy {
  const mainChannel = bpo.latestByChannel[StableChannel] !== undefined ? StableChannel : AnyChannel;
  const latestOverview = bpo.latestByChannel[mainChannel];
  return {
    id: latestOverview.id,
    meta: latestOverview.meta,
    // so we only add stable channel specs to projects, to smooth the transition
    spec: { ...(latestOverview.spec as BlockPackFromRegistryV2), channel: StableChannel },
    otherVersions: bpo.allVersions
      .filter((entry) => entry.channels.indexOf(mainChannel) >= 0)
      .map((entry) => entry.version),
    registryId: bpo.registryId,
  };
}
