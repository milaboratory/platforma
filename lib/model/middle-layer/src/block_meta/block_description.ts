import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { BlockComponentsDescriptionRaw } from "./block_components";
import { BlockPackMetaDescriptionRaw } from "./block_meta";
import { BlockPackId } from "./block_id";
import * as R from "remeda";
import type { BlockCodeKnownFeatureFlags } from "@milaboratories/pl-model-common";

/** Description, as appears in root block package.json file,
 * `file:` references are parsed into relative content of corresponding type, depending on the context,
 * strings are converted to explicit content type. */
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
  return R.mergeDeep(manifest, { id: { version: newVersion } }) as T;
}
