import { z } from 'zod';

export const PlRef = z
  .object({
    __isRef: z
      .literal(true)
      .describe('Crucial marker for the block dependency tree reconstruction'),
    blockId: z.string()
      .describe('Upstream block id'),
    name: z.string()
      .describe('Name of the output provided to the upstream block\'s output context'),
    requireEnrichments: z.literal(true).optional()
      .describe('True if current block that stores this reference in its args, may need enrichments '
        + 'for the references value originating from the blocks in between current and referenced block'),
  })
  .describe(
    'Universal reference type, allowing to set block connections. It is crucial that '
    + '{@link __isRef} is present and equal to true, internal logic relies on this marker '
    + 'to build block dependency trees.',
  )
  .strict()
  .readonly();
export type PlRef = z.infer<typeof PlRef>;
/** @deprecated use {@link PlRef} */
export type Ref = PlRef;

/**
 * Type guard to check if a value is a PlRef.
 *
 * @param value - The value to check.
 * @returns True if the value is a PlRef, false otherwise.
 */
export function isPlRef(value: unknown): value is PlRef {
  return (
    typeof value === 'object'
    && value !== null
    && '__isRef' in value
    && (value as { __isRef: unknown }).__isRef === true
    && 'blockId' in value
    && 'name' in value
  );
}

/** Standard way how to communicate possible connections given specific
 * requirements for incoming data. */
export type Option = {
  /** Fully rendered reference to be assigned for the intended field in block's
   * args */
  readonly ref: PlRef;

  /** Label to be present for the user in i.e. drop-down list */
  readonly label: string;
};

/** Compare two PlRefs and returns true if they are qual */
export function plRefsEqual(ref1: PlRef, ref2: PlRef) {
  return ref1.blockId === ref2.blockId && ref1.name === ref2.name;
}
