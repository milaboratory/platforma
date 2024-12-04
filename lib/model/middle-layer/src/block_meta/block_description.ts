import { z, ZodTypeAny } from 'zod';
import { BlockComponentsDescriptionRaw } from './block_components';
import { BlockPackMetaDescriptionRaw } from './block_meta';
import { BlockPackId } from './block_id';
import * as R from 'remeda';

/** Description, as appears in root block package.json file,
 * `file:` references are parsed into relative content of corresponding type, depending on the context,
 * strings are converted to explicit content type. */
export const BlockPackDescriptionFromPackageJsonRaw = z.object({
  components: BlockComponentsDescriptionRaw,
  meta: BlockPackMetaDescriptionRaw
});

export function CreateBlockPackDescriptionSchema<
  Components extends ZodTypeAny,
  Meta extends ZodTypeAny
>(components: Components, meta: Meta) {
  return z.object({
    id: BlockPackId,
    components,
    meta
  });
}

export const BlockPackDescriptionRaw = CreateBlockPackDescriptionSchema(
  BlockComponentsDescriptionRaw,
  BlockPackMetaDescriptionRaw
);
export type BlockPackDescriptionRaw = z.infer<typeof BlockPackDescriptionRaw>;

export function overrideDescriptionVersion<T extends { id: BlockPackId }>(
  manifest: T,
  newVersion: string
): T {
  return R.mergeDeep(manifest, { id: { version: newVersion } }) as T;
}
