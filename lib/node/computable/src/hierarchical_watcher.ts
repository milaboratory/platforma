import type { Watcher } from './watcher';
import { Aborted } from '@milaboratories/ts-helpers';

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
  private parent: HierarchicalWatcher | undefined = undefined;

  /** Set of HierarchicalWatchers that will trigger change of this instance if they got changed. */
  private readonly children: HierarchicalWatcher[];

  /**
   * Resolution of these promises interrupt polling listen, to reactively do something
   * when the element or its descendants get changed
   */
  private onChangeCallbacks?: Map<symbol, () => void> | undefined = undefined;

  public changeSourceMarker?: string;

  private changed: boolean = false;

  constructor(children: HierarchicalWatcher[] = []) {
    this.children = children;

    if (this.children.some((c) => c.changed)) this.changed = true;
    else this.children.forEach((c) => c.setParent(this));
  }

  public get isChanged() {
    return this.changed;
  }

  private setParent(parent: HierarchicalWatcher) {
    if (this.changed) throw new Error('parent can\'t be set to changed watcher');
    if (this.parent !== undefined) throw new Error('parent can be set only if it wasn\'t reset');
    this.parent = parent;
  }

  private resetParent() {
    this.parent = undefined;
  }

  public markChanged(marker?: string): void {
    console.log('HierarchicalWatcher.markChanged called', {
      alreadyChanged: this.changed,
      hasCallbacks: this.onChangeCallbacks !== undefined,
      callbacksCount: this.onChangeCallbacks?.size ?? 0,
      hasParent: this.parent !== undefined,
      childrenCount: this.children.length,
      marker,
    });

    if (this.changed) {
      console.log('HierarchicalWatcher.markChanged: already changed, returning early');
      return;
    }

    this.changed = true;
    this.changeSourceMarker = marker;
    this.children.forEach((c) => c.resetParent());

    // triggering change event for those who listen
    if (this.onChangeCallbacks !== undefined) {
      console.log('HierarchicalWatcher.markChanged: calling callbacks', {
        count: this.onChangeCallbacks.size,
      });
      this.onChangeCallbacks.forEach((cb) => cb());
      this.onChangeCallbacks = undefined; // for gc
      console.log('HierarchicalWatcher.markChanged: callbacks called and cleared');
    } else {
      console.log('HierarchicalWatcher.markChanged: no callbacks to call');
    }

    if (this.parent != undefined) {
      console.log('HierarchicalWatcher.markChanged: propagating to parent');
      this.parent.markChanged(marker);
      this.parent = undefined;
    } else {
      console.log('HierarchicalWatcher.markChanged: no parent to propagate to');
    }
    console.log('HierarchicalWatcher.markChanged: finished');
  }

  /** @deprecated use {@link awaitChange} */
  public listen(abortSignal?: AbortSignal): Promise<void> {
    return this.awaitChange(abortSignal);
  }

  public awaitChange(abortSignal?: AbortSignal): Promise<void> {
    console.log('HierarchicalWatcher.awaitChange called', {
      alreadyChanged: this.changed,
      hasCallbacks: this.onChangeCallbacks !== undefined,
      hasParent: this.parent !== undefined,
      childrenCount: this.children.length,
    });

    if (this.changed) {
      console.log('HierarchicalWatcher.awaitChange: already changed, returning immediately');
      return Promise.resolve();
    }

    // lazy creating a map to hold change callbacks if not yet created
    if (this.onChangeCallbacks === undefined)
      this.onChangeCallbacks = new Map<symbol, () => void>();
    // constant copy to pass to closures
    const callbacks = this.onChangeCallbacks;

    // generating unique symbol that will allow to address resources
    // allocated for created promise
    const callId = Symbol();

    console.log('HierarchicalWatcher.awaitChange: creating promise and registering callback');

    if (abortSignal !== undefined)
      return new Promise<void>((res, rej) => {
        if (abortSignal.aborted) {
          rej(new Aborted(abortSignal.reason));
          return;
        }

        const abortCb = () => {
          // removing our promise from the set of promises that will be
          // fulfilled on watcher change
          callbacks.delete(callId);
          // rejecting the promise
          rej(new Aborted(abortSignal.reason));
        };

        const resolveCb = () => {
          console.log('HierarchicalWatcher.awaitChange: resolveCb called!');
          // removing our promise from abort signal listener
          abortSignal.removeEventListener('abort', abortCb);
          // resolving the promise to send the change signal
          res();
        };

        // listening if abort event happens before watcher was marked as changed
        abortSignal.addEventListener('abort', abortCb);

        // adding callback to be called once the watcher is marked as changed
        callbacks.set(callId, resolveCb);
        console.log('HierarchicalWatcher.awaitChange: callback registered', {
          callbacksCount: callbacks.size,
        });
      });
    else
      return new Promise((resolve) => {
        // adding the resolve callback forever until the watcher is marked as changed
        callbacks.set(callId, resolve);
        console.log('HierarchicalWatcher.awaitChange: callback registered', {
          callbacksCount: callbacks.size,
          callbackFunction: resolve.toString(),
        });
      });
  }
}
