import { KindResolutionError } from "@platforma-sdk/block-tools";
import type {
  BlockPackFromRegistryV2,
  BlockPackId,
  RegistryEntry,
  SingleBlockPackOverview,
} from "@milaboratories/pl-model-middle-layer";
import { StableChannel } from "@milaboratories/pl-model-middle-layer";
import type { BlockKindReference } from "@milaboratories/pl-model-common";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { ensureError } from "@platforma-sdk/model";
import type { BlockPackProvider, ExactResolution, KindResolution } from "../model/template_resolve";
import { resolveBlockPackLocation } from "./location_provider";

/**
 * The part of {@link BlockPackRegistry} a template's provider uses.
 *
 * Structural, so the provider can be exercised without a registry, a network or a
 * configured environment — and so it is obvious that these two calls are the entire
 * dependency.
 */
export type KindAwareRegistry = {
  resolveKind: (
    registryId: string,
    ref: BlockKindReference,
    options: { allowUnstable: boolean },
  ) => Promise<BlockPackFromRegistryV2>;
  getOverview: (
    registryId: string,
    blockId: BlockPackId,
    channel: string,
  ) => Promise<SingleBlockPackOverview>;
};

/**
 * The ids of the configured registries a template can be resolved against, in the order
 * they should be consulted.
 *
 * Answers the standing "which registry" question, and answers it by capability rather
 * than by preference: kinds are published to the `kinds/` tree of a `remote-v2`
 * registry, so no other registry type can satisfy an entry at all. A `local-dev`
 * registry serves dev packets, which have no manifest and no kind publication — every
 * template entry names a kind, so such a registry can never answer one.
 *
 * Configured order is kept: it is the order the environment chose, and the first
 * registry that has the kind wins. Nothing here dedupes a kind published to two
 * registries — with the search stopping at the first hit, the earlier registry is
 * simply the answer.
 */
export function kindCapableRegistryIds(entries: readonly RegistryEntry[]): string[] {
  return entries.filter((entry) => entry.spec.type === "remote-v2").map((entry) => entry.id);
}

/**
 * A {@link BlockPackProvider} over the configured block registries.
 *
 * The adapter between the import path's port and what the registry layer already does:
 * `resolveKind` walks a kind's projection and picks an implementing block,
 * `getOverview` reads one block's manifest. Both live in the registry; the port exists
 * so that resolution can be tested without one, and so that which registries to consult
 * stays an environment decision.
 *
 * Both routes also return the block's published title, because both have to read a
 * manifest to produce a spec anyway and nothing downstream can recover it. On the pinned
 * route it is free; on the kind route it costs one manifest read after the projection.
 *
 * @param registryIds Registries to consult, in order — see {@link kindCapableRegistryIds}
 * @param logger Where a registry that could not answer is recorded. A read failure and
 *   an absent block are indistinguishable here (the reader throws for both), so the
 *   fallback to the next registry has to swallow the reason; this is the only place it
 *   survives
 */
export function templateBlockPackProvider(deps: {
  readonly registry: KindAwareRegistry;
  readonly registryIds: readonly string[];
  readonly logger: MiLogger;
}): BlockPackProvider {
  const { registry, registryIds, logger } = deps;

  return {
    byKind: async (kind, options): Promise<KindResolution> => {
      let furthest: KindResolutionFailure | undefined;

      for (const registryId of registryIds) {
        try {
          // The selector brand is widened here, deliberately and in one place. The
          // facade types this parameter as an exact `{name}@X.Y.Z` reference, but its
          // implementation passes the version segment to the selector parser, so
          // `~`/`^` resolve correctly — the type is narrower than the behaviour. Until
          // the facade takes the selector brand, the cast is the honest way to say so.
          const spec = await registry.resolveKind(
            registryId,
            kind as unknown as BlockKindReference,
            options,
          );
          // Read back the manifest of the block the projection picked, in the channel it
          // was picked from. `channel` is optional on the spec and the resolver always
          // fills it, so the fallback is unreachable — it exists because the channel only
          // decides where future update suggestions come from, and `stable` is the answer
          // that surprises nobody.
          const overview = await registry.getOverview(
            registryId,
            spec.id,
            spec.channel ?? StableChannel,
          );
          return { ok: true, spec, title: overview.meta.title };
        } catch (e) {
          if (!(e instanceof KindResolutionError)) {
            // Not an answer about this kind: an unreadable registry, or a registry that
            // does not serve kinds at all. Falling through would report "no such kind"
            // for what is really an outage, so it propagates instead. (The second case
            // is unreachable through `kindCapableRegistryIds`, which filters by type.)
            throw e;
          }
          furthest = furthestFailure(furthest, e.reason);
        }
      }

      return { ok: false, reason: furthest ?? "no-matching-kind-version" };
    },

    // No registry is consulted for a located entry, and none of this adapter's
    // registry knowledge applies to it — which is why it is a straight delegation.
    byLocation: resolveBlockPackLocation,

    byExactVersion: async (id): Promise<ExactResolution> => {
      for (const registryId of registryIds) {
        try {
          // `stable` is recorded on the spec as the channel to watch for updates in.
          // The entry pinned this exact version, so nothing is being chosen here — the
          // channel only decides where a future update suggestion would come from.
          const overview = await registry.getOverview(registryId, id, StableChannel);
          return { ok: true, spec: overview.spec, title: overview.meta.title };
        } catch (e) {
          logger.info(
            `template apply: block ${id.organization}/${id.name} ${id.version} not read ` +
              `from registry '${registryId}': ${ensureError(e).message}`,
          );
        }
      }

      return { ok: false, reason: "no-such-block-version" };
    },
  };
}

type KindResolutionFailure = Extract<KindResolution, { ok: false }>["reason"];

/**
 * The more informative of two failures across registries.
 *
 * With several registries consulted, the reasons can differ — one has never heard of the
 * kind, another has it but only as a pre-release. Reporting the first would tell the
 * reader to check their spelling when the real answer is "import again with unstable
 * allowed", so the one that got furthest wins.
 */
function furthestFailure(
  current: KindResolutionFailure | undefined,
  next: KindResolutionFailure,
): KindResolutionFailure {
  const rank: Record<KindResolutionFailure, number> = {
    "no-matching-kind-version": 0,
    "no-implementation": 1,
    "no-stable-implementation": 2,
  };
  if (current === undefined) return next;
  return rank[next] > rank[current] ? next : current;
}
