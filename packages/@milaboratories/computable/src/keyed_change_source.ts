import type { Watcher } from "./watcher";

const DEFAULT_CHANGE_SOURCE_RECHECK_PERIOD = 17;

class WatcherGroup {
  watchers: WeakRef<Watcher>[] = [];
  watcherSet: WeakSet<Watcher> = new WeakSet();

  attach(watcher: Watcher) {
    if (this.watcherSet.has(watcher)) {
      return;
    }

    this.watchers.push(new WeakRef(watcher));
    this.watcherSet.add(watcher);
  }

  notify(marker?: string) {
    this.watchers.forEach((w) => w.deref()?.markChanged(marker));
  }

  refresh() {
    this.watchers = this.watchers.filter((ref) => {
      const w = ref.deref();
      if (w === undefined) {
        // watcher was garbage collected
        return false;
      }
      if (w.isChanged) {
        // this watcher will be deleted from the list, so also deleting it from the set
        this.watcherSet.delete(w);
        return false;
      }
      return true;
    });
  }
}

/**
 * A variant of ChangeSource that stores watchers under keys, and marks changes also by key.
 * Watchers are stored using weak references, so they can be garbage collected.
 */
export class KeyedChangeSource {
  private watcherGroups: Map<string, WatcherGroup> = new Map();
  private modCount = 0;

  public constructor(
    private readonly recheckPeriod: number = DEFAULT_CHANGE_SOURCE_RECHECK_PERIOD,
  ) {}

  /**
   * Attach a watcher to a specific key.
   * @param key The key to associate the watcher with.
   * @param watcher The watcher to attach.
   */
  public attachWatcher(key: string, watcher: Watcher) {
    let group = this.watcherGroups.get(key);
    if (!group) {
      group = new WatcherGroup();
      this.watcherGroups.set(key, group);
    }
    group.attach(watcher);
    this.modCount++;
    if (this.modCount >= this.recheckPeriod) {
      this.refresh();
    }
  }

  /**
   * Marks all watchers associated with the given key as changed.
   * This will trigger their change handlers and remove them from this source.
   * @param key The key for which to mark watchers as changed.
   * @param marker An optional marker to pass to the watchers.
   */
  public markChanged(key: string, marker?: string) {
    const group = this.watcherGroups.get(key);
    if (group) {
      group.notify(marker);
      this.watcherGroups.delete(key);
    }
  }

  /**
   * Marks all watchers as changed.
   * @param marker An optional marker to pass to the watchers.
   */
  public markAllChanged(marker?: string) {
    this.watcherGroups.forEach((group) => group.notify(marker));
    this.watcherGroups.clear();
    this.modCount = 0;
  }

  private refresh() {
    this.modCount = 0;
    for (const [key, group] of this.watcherGroups.entries()) {
      group.refresh();
      if (group.watchers.length === 0) {
        this.watcherGroups.delete(key);
      }
    }
  }

  /**
   * For testing purposes. Returns the number of watchers for a given key.
   */
  public getWatchersCount(key: string): number {
    const group = this.watcherGroups.get(key);
    if (!group) {
      return 0;
    }
    group.refresh(); // to get actual count
    return group.watchers.length;
  }
}
