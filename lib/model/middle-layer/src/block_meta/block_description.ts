import * as v from "valibot";
import { BlockComponentsDescriptionRaw } from "./block_components";
import { BlockPackMetaDescriptionRaw } from "./block_meta";
import { BlockPackId } from "./block_id";
import { toMerged } from "es-toolkit";
import type {
  BlockCodeKnownFeatureFlags,
  BlockKindReference,
} from "@milaboratories/pl-model-common";

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
  /** Reference to the block kind this pack implements, in `{name}@{version}`
   * form. Lifted from the model's container-level `kind` by build_dist. */
  kind?: BlockKindReference;
};

/**
 * Description as it appears in the root block `package.json`. `file:`-prefixed
 * strings become `ContentRelative`; bare text strings become
 * `ContentExplicitString`. See `DescriptionContentText`/`DescriptionContentBinary`.
 */
export const BlockPackDescriptionFromPackageJsonRaw = v.object({
  components: BlockComponentsDescriptionRaw,
  meta: BlockPackMetaDescriptionRaw,
});

export const FeatureFlags = v.pipe(
  v.record(v.string(), v.union([v.boolean(), v.number()])),
  v.transform((flags) => flags as BlockCodeKnownFeatureFlags),
);

/** Block-kind reference schema — a plain `{name}@{version}` string at rest. */
export const BlockKindRef = v.pipe(
  v.string(),
  v.transform((s) => s as BlockKindReference),
);

export function CreateBlockPackDescriptionSchema<
  const Components extends v.GenericSchema,
  const Meta extends v.GenericSchema,
>(components: Components, meta: Meta) {
  return v.looseObject({
    id: BlockPackId,
    components,
    meta,
    featureFlags: v.optional(FeatureFlags),
    kind: v.optional(BlockKindRef),
  });
}

export const BlockPackDescriptionRaw = CreateBlockPackDescriptionSchema(
  BlockComponentsDescriptionRaw,
  BlockPackMetaDescriptionRaw,
);
export type BlockPackDescriptionRaw = v.InferOutput<typeof BlockPackDescriptionRaw>;

export function overrideDescriptionVersion<T extends { id: BlockPackId }>(
  manifest: T,
  newVersion: string,
): T {
  return toMerged(manifest, { id: { version: newVersion } }) as T;
}
