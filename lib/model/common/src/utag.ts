/** Value returned for changing states supporting reactive listening for changes */
export interface ValueWithUTag<V> {
  /** Value snapshot. */
  readonly value: V;

  /**
   * Unique tag for the value snapshot.
   *
   * It can be used to synchronously detect if changes happened after current
   * snapshot was retrieved, or asynchronously await next value snapshot,
   * generated on underlying data changes.
   * */
  readonly uTag: string;
}
