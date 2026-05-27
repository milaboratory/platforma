import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { BlockComponentsDescriptionRaw } from "./block_components";
import { BlockPackMetaDescriptionRaw } from "./block_meta";
import { BlockPackId } from "./block_id";
import { toMerged } from "es-toolkit";
import type { BlockCodeKnownFeatureFlags } from "@milaboratories/pl-model-common";

/**
 * Block-pack description: a `BlockPackId`, the typed `components` and `meta`
 * payloads, and optional `featureFlags`. The two type parameters let the same
 * shape carry every form a description travels in — `package.json` source,
 * relative-path manifest, absolute-path resolved.
 */
export type BlockPackDescription<Components, Meta> = {
  id: BlockPackId;
  components: Components;
  meta: Meta;
  featureFlags?: BlockCodeKnownFeatureFlags;
};

/**
 * Description as it appears in the root block `package.json`. `file:`-prefixed
 * strings become `ContentRelative`; bare text strings become
 * `ContentExplicitString`. See `DescriptionContentText`/`DescriptionContentBinary`.
 */
export const BlockPackDescriptionFromPackageJsonRaw = z.object({
  components: BlockComponentsDescriptionRaw,
  meta: BlockPackMetaDescriptionRaw,
});

export const FeatureFlags = z
  .record(z.string(), z.union([z.boolean(), z.number()]))
  .transform((flags) => flags as BlockCodeKnownFeatureFlags);

export function CreateBlockPackDescriptionSchema<
  Components extends ZodTypeAny,
  Meta extends ZodTypeAny,
>(components: Components, meta: Meta) {
  return z
    .object({
      id: BlockPackId,
      components,
      meta,
      featureFlags: FeatureFlags.optional(),
    })
    .passthrough();
}

export const BlockPackDescriptionRaw = CreateBlockPackDescriptionSchema(
  BlockComponentsDescriptionRaw,
  BlockPackMetaDescriptionRaw,
);
export type BlockPackDescriptionRaw = z.infer<typeof BlockPackDescriptionRaw>;

export function overrideDescriptionVersion<T extends { id: BlockPackId }>(
  manifest: T,
  newVersion: string,
): T {
  return toMerged(manifest, { id: { version: newVersion } }) as T;
}
