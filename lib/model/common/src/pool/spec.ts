import { Branded } from '../branding';

/** Any object exported into the result pool by the block always have spec attached to it */
export interface PObjectSpec {
  /** PObject kind discriminator */
  readonly kind: string;

  /** Additional information attached to the object */
  readonly annotations?: Record<string, string>;
}

/** Stable PObject id */
export type PObjectId = Branded<string, 'PColumnId'>;

/**
 * Full PObject representation.
 *
 * @template Data type of the object referencing or describing the "data" part of the PObject
 * */
export interface PObject<Data> {
  /** Fully rendered PObjects are assigned a stable identifier. */
  readonly id: PObjectId;

  /** PObject spec, allowing it to be found among other PObjects */
  readonly spec: PObjectSpec;

  /** A handle to data object */
  readonly data: Data;
}
