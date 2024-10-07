import { z } from 'zod';

export const Ref = z
  .object({
    __isRef: z
      .literal(true)
      .describe('Crucial marker for the block dependency tree reconstruction'),
    blockId: z.string().describe('Upstream block id'),
    name: z.string().describe("Name of the output provided to the upstream block's output context")
  })
  .describe(
    'Universal reference type, allowing to set block connections. It is crucial that ' +
      '{@link __isRef} is present and equal to true, internal logic relies on this marker ' +
      'to build block dependency trees.'
  )
  .strict()
  .readonly();
export type Ref = z.infer<typeof Ref>;

/** Standard way how to communicate possible connections given specific
 * requirements for incoming data. */
export type Option = {
  /** Fully rendered reference to be assigned for the intended field in block's
   * args */
  readonly ref: Ref;

  /** Label to be present for the user in i.e. drop-down list */
  readonly label: string;
};
