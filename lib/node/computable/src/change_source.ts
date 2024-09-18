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
  private watchers: WeakRef<Watcher>[] | undefined = undefined;
  /** Used to prevent adding the same watcher multiple times */
  private watcherSet: WeakSet<Watcher> | undefined = undefined;
  /** Used to track array recheck period */
  private modCount: number = 0;

  public constructor(
    private readonly recheckPeriod: number = DEFAULT_CHANGE_SOURCE_RECHECK_PERIOD
  ) {}

  /** Attach a watcher to the change source. Periodically this method performs
   * garbage collection that cost O(N) in theory, though in real cases there
   * should not be too many listeners for a specific change source. */
  public attachWatcher(watcher: Watcher) {
    if (this.watcherSet === undefined) {
      this.watchers = [];
      this.watcherSet = new WeakSet();
    } else if (this.watcherSet.has(watcher)) return;

    this.modCount++;
    if (this.modCount == this.recheckPeriod) this.refresh();
    this.watchers!.push(new WeakRef(watcher));
    this.watcherSet.add(watcher);
  }

  /** Marks all watchers as changed and clears current watcher list. */
  public markChanged() {
    if (this.watchers === undefined) return;

    this.watchers.forEach((w) => w.deref()?.markChanged());

    this.modCount = 0;
    this.watchers = undefined;
    this.watcherSet = undefined;
  }

  /** Returns actual number of watchers in this source. For that GC round is
   * executed, so beware, complexity of this method is O(N). */
  public get size(): number {
    if (this.watchers === undefined) return 0;
    this.refresh();
    return this.watchers.length;
  }

  /** Performs GC. */
  private refresh() {
    if (this.modCount === 0 || this.watchers === undefined) return;
    this.modCount = 0;
    this.watchers = this.watchers.filter((ref) => {
      const w = ref.deref();
      if (w === undefined)
        // watcher was garbage collected
        return false;
      if (w.isChanged) {
        // this watcher will be deleted from the list, so also deleting it from the set
        this.watcherSet!.delete(w);
        return false;
      }
      return true;
    });
  }
}
