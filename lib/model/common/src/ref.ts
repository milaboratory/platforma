import { PDataHandle } from './data';
import { PObject } from './pool';

/** Universal reference type, allowing to set block connections. It is crucial
 * that {@link __isRef} is present and equal to true, internal logic relies on
 * this marker to build block dependency trees. */
export type Ref = {
  /** Crucial marker for the block dependency tree reconstruction */
  readonly __isRef: true;

  /** Upstream block id */
  readonly blockId: string;

  /** Name of the output provided to the upstream block's output context */
  readonly name: string;
};

/** Standard way how to communicate possible connections given specific
 * requirements for incoming data. */
export type Option = {
  /** Fully rendered reference to be assigned for the intended field in block's
   * args */
  readonly ref: Ref;

  /** Label to be present for the user in i.e. drop-down list */
  readonly label: string;
};

/** Result pool entry */
export type ResultPoolEntry = {
  readonly ref: Ref;
  readonly obj: PObject<PDataHandle>;
};
