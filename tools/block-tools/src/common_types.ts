import { z } from 'zod';

export const PlRegAddress = z.string().regex(/^(?:s3:|file:)/);
