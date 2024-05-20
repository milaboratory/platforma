import { Watcher } from './watcher';

/**
 * Instances of this class may form a tree of watchers having parent-child relations.
 * If a node is changed, the change bubbles up to the root.
 * A client can check manually or listen to a Promise that resolves
 * when the watcher or its descendants were changed.
 */
export class HierarchicalWatcher implements Watcher {
  /**
   * Set by the parent to track children changes.
   * Any child can have only one parent at any point of time (cruel!).
   */
  private parent: HierarchicalWatcher | null = null;

  /** Set of HierarchicalWatchers that will trigger change of this instance if they got changed. */
  private readonly children: HierarchicalWatcher[];

  /**
   * Resolution of this promise interrupt polling listen, to do something when the element or its
   * descendants gets changed.
   */
  private changedPromise: Promise<void> | null = null;
  private changedPromiseResolve: (() => void) | null = null;

  private changed: boolean = false;

  constructor(
    children: HierarchicalWatcher[] = []
  ) {
    this.children = children;

    if (this.children.some((c) => c.changed)) this.changed = true;
    else this.children.forEach((c) => c.setParent(this));
  }

  get isChanged() {
    return this.changed;
  }

  private setParent(parent: HierarchicalWatcher) {
    if (this.changed)
      throw new Error('parent can\'t be set to changed watcher');
    if (this.parent !== null)
      throw new Error('parent can be set only if it wasn\'t reset');
    this.parent = parent;
  }

  private resetParent() {
    this.parent = null;
  }

  private ensureChangedPromise() {
    if (this.changedPromise !== null) return;
    if (this.changed) this.changedPromise = Promise.resolve();
    else
      this.changedPromise = new Promise(
        (resolve) => (this.changedPromiseResolve = resolve)
      );
  }

  markChanged(): void {
    if (this.changed) return;

    this.changed = true;
    this.children.forEach((c) => c.resetParent());

    if (this.changedPromiseResolve != null) this.changedPromiseResolve();
    if (this.parent != null) this.parent.markChanged();
  }

  listen(): Promise<void> {
    this.ensureChangedPromise();
    return this.changedPromise!;
  }
}
