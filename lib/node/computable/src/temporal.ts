import { Watcher } from './watcher';

const watcherGCRegistry =
  new FinalizationRegistry<NodeJS.Timeout>(timerRef => {
    clearTimeout(timerRef);
  });

function markChangedAfterDelay(watcher: Watcher, ms: number) {
  const watcherRef = new WeakRef(watcher);
  const timerRef = setTimeout(() => watcherRef.deref()?.markChanged(), ms);
  watcherGCRegistry.register(watcherRef, timerRef);
}
