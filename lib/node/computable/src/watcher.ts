/**
 * Central abstraction of this library. Represents an object that can be once
 * marked as changed. {@link HierarchicalWatcher} is the main implementation.
 *
 * Instances of these objects are one-time usable, once marked as changed they
 * stay this way for the rest of their lifetime.
 */
export interface Watcher {
  /** True, if this object was marked as changed. */
  readonly isChanged: boolean;

  /**
   * Marker of the change source.
   *
   * Optionally set by some change source, marker can be used to identify the source of the change.
   */
  readonly changeSourceMarker?: string;

  /**
   * Marks watcher as changed.
   *
   * @param marker - optional marker to identify the source of the change.
   */
  markChanged(marker?: string): void;
}
