import { z } from 'zod';
import { SemVer } from './semver';

/** Global identifier of the block */
export const BlockPackId = z
  .object({
    organization: z.string(),
    name: z.string(),
    version: SemVer
  })
  .strict();
export type BlockPackId = z.infer<typeof BlockPackId>;

export const BlockPackIdNoVersion = BlockPackId.omit({ version: true });
export type BlockPackIdNoVersion = z.infer<typeof BlockPackIdNoVersion>;

export function blockPackIdEquals(
  bp1: BlockPackId | undefined,
  bp2: BlockPackId | undefined
): boolean {
  if (bp1 === undefined && bp2 === undefined) return true;
  if (bp1 === undefined || bp2 === undefined) return false;
  return (
    bp1.name === bp2.name && bp1.organization === bp2.organization && bp1.version === bp2.version
  );
}

export function blockPackIdNoVersionEquals(
  bp1: BlockPackIdNoVersion | undefined,
  bp2: BlockPackIdNoVersion | undefined
): boolean {
  if (bp1 === undefined && bp2 === undefined) return true;
  if (bp1 === undefined || bp2 === undefined) return false;
  return bp1.name === bp2.name && bp1.organization === bp2.organization;
}
