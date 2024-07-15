import { Ref } from '../ref';
import { PObject } from './spec';

/** Result pool entry */
export type ResultPoolEntry<Data> = {
  /** Reference that can be passed to args to import the object in workflow */
  readonly ref: Ref;

  /** PObject itself */
  readonly obj: PObject<Data>;
};

/** Collection of results from the result pool */
export type ResultCollection<Data> = {
  /** List of results from the pool */
  readonly entries: ResultPoolEntry<Data>[];

  /** False means that current collection is not fully loaded due to some computations still taking place */
  readonly isComplete: boolean;
};
