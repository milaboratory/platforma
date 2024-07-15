import { Ref } from '../ref';
import { PObject } from './spec';

/** Result pool entry */
export type ResultPoolEntry<Data> = {
  /** Reference that can be passed to args to import the object in workflow */
  readonly ref: Ref;

  /** PObject itself */
  readonly obj: PObject<Data>;
};
