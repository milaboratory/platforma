import type { BasicResourceData, ResourceData } from './types';

export type ResourceDataCacheRecord = {
  /** There is a slight chance of inconsistent data retrieval from tx if we allow later transactions to leak resource data into earlier transactions.
   * This field allows to prevent this. */
  cacheTxOpenTimestamp: number;
  data: ResourceData | undefined;
  readonly basicData: BasicResourceData;
};
