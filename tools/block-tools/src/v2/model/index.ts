import { z } from 'zod';
import { BlockComponentsDescription, BlockComponentsDescriptionRaw } from './block_components';
import { BlockPackId, BlockPackIdNoVersion } from './block_pack_id';
import { BlockPackMetaDescription, BlockPackMetaDescriptionRaw } from './meta';

export const BlockPackDescriptionFromPackageJsonRaw = z.object({
  components: BlockComponentsDescriptionRaw,
  meta: BlockPackMetaDescriptionRaw
});

export function ResolvedBlockPackDescriptionFromPackageJson(root: string) {
  return z.object({
    id: BlockPackId,
    components: BlockComponentsDescription(root),
    meta: BlockPackMetaDescription(root)
  });
}
/** Finally resolved Block Pack Description */
export type BlockPackDescription = z.infer<
  ReturnType<typeof ResolvedBlockPackDescriptionFromPackageJson>
>;
