import { z } from 'zod';
import { SemVer } from '../common_types';

/** Global identifier of the block */
export const BlockPackId = z
  .object({
    organization: z.string(),
    name: z.string(),
    version: SemVer
  })
  .strict();
export type BlockPackId = z.infer<typeof BlockPackId>;
