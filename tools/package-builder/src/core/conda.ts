import { z } from 'zod';

const readArtifact = <T extends z.ZodTypeAny>(data: string, schema: T): z.infer<T> => {
  const parsedData: unknown = JSON.parse(data);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return schema.parse(parsedData);
};

const sc = z.object({
  t: z.literal('mmm'),
  n: z.number().optional(),
});

const _val = readArtifact(`{"t": "mmm", "n": 1}`, sc);
console.log(_val);
