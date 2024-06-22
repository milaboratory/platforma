/** Universal reference type, allowing to set block connections. It is crucial
 * that {@link __isRef} is present and equal to true, internal logic relies on
 * this marker to build block dependency trees. */
export type Ref = {
  /** Crucial marker for the block dependency tree reconstruction */
  __isRef: true

  /** Upstream block id */
  blockId: string

  /** Name of the output provided to the upstream block's output context */
  name: string
}

/** Standard way how to communicate possible connections given specific
 * requirements for incoming data. */
export type Option = {
  /** Fully rendered reference to be assigned for the intended field in block's
   * args */
  ref: Ref,
  
  /** Label to be present for the user in i.e. drop-down list */
  label: string
}
