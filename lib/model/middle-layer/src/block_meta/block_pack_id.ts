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
