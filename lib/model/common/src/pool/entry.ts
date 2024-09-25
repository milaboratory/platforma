import type { Ref } from '../ref';
import { PObject } from './spec';

/** Result pool entry */
export type ResultPoolEntry<O> = {
  /** Reference that can be passed to args to import the object in workflow */
  readonly ref: Ref;

  /** Object. Normally spec or PObject. */
  readonly obj: O;
};

/** Collection of results from the result pool */
export type ResultCollection<O> = {
  /** List of results from the pool */
  readonly entries: ResultPoolEntry<O>[];

  /** False means that current collection is not fully loaded due to some computations still taking place */
  readonly isComplete: boolean;
};
