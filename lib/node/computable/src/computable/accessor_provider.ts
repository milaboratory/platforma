import { Watcher } from '../watcher';

export interface TrackedAccessorProvider<I> {
  createInstance(watcher: Watcher): I;
}
