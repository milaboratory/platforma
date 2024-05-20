import { Watcher } from './watcher';

const DEFAULT_CHANGE_SOURCE_RECHECK_PERIOD = 7;

/**
 * Object that accumulates multiple watchers interested in the same specific change event.
 * Among grouping of watchers it periodically checks for already triggered watchers, and recycles
 * the corresponding space to free up memory and prevent memory leeks for rarely firing
 * change sources.
 *
 * In contrast to {@link watchers} instances of this class are meant to be reusable,
 * in the sense that after {@link markChanged} is called, it is ready to accumulate
 * new watchers until the cycle is repeated.
 * */
export class ChangeSource {
  /** List of weak references to watchers currently interested in this change source */
  private watchers: WeakRef<Watcher>[] = [];
  /** Used to track array recheck period */
  private counter: number = 0;

  constructor(private recheckPeriod: number = DEFAULT_CHANGE_SOURCE_RECHECK_PERIOD) {
  }

  /** Attach a watcher to the change source. Periodically this method performs
   * garbage collection that cost O(N) in theory, though in real cases there
   * should not be too many listeners for a specific change source. */
  attachWatcher(watcher: Watcher) {
    this.counter++;
    if (this.counter == this.recheckPeriod) {
      this.counter = 0;
      this.watchers = this.watchers.filter((ref) => {
        const w = ref.deref();
        return w !== undefined && !w.isChanged;
      });
    }
    this.watchers.push(new WeakRef(watcher));
  }

  /** Marks all watchers as changed and clears current watcher list. */
  markChanged() {
    this.watchers.forEach((w) => w.deref()?.markChanged());
    this.watchers.length = 0; // clean()
  }
}
