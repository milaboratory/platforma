/** Debug representation of block storage state. */
export interface StorageDebugView {
  /** Current data version key */
  dataVersion: string;
  /** Raw data payload stored in BlockStorage */
  data: unknown;
}
