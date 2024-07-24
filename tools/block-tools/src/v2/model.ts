import { z } from 'zod';
import { BlockComponentsDescription } from './block_components';

export function BlockDescription(root: string) {
  return z.object({
    id: 
    components: BlockComponentsDescription(moduleRoot),
    meta: 
  });
}
