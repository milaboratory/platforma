import type { Watcher } from './watcher';

const watcherGCRegistry = new FinalizationRegistry<NodeJS.Timeout>((timerRef) => {
  clearTimeout(timerRef);
});

// @TODO: unused code
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function markChangedAfterDelay(watcher: Watcher, ms: number) {
  const watcherRef = new WeakRef(watcher);
  const timerRef = setTimeout(() => watcherRef.deref()?.markChanged(), ms);
  watcherGCRegistry.register(watcherRef, timerRef);
}
