/**
 * Central abstraction of this library. Represents an object that can be once
 * marked as changed. {@link HierarchicalWatcher} is the main implementation.
 *
 * Instances of these objects are one-time usable, once marked as changed they
 * stay this way for the rest of their lifetime.
 */
export interface Watcher {
  /** True, if this object was marked as changed. */
  isChanged: boolean;

  /** Marks watcher as changed. */
  markChanged(): void;
}
