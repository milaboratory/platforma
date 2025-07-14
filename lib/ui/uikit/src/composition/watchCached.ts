import { isJsonEqual } from '@milaboratories/helpers';
import {
  ref,
  watch,
  type WatchCallback,
  type WatchHandle,
  type WatchSource,
} from 'vue';

type MaybeUndefined<T, I> = I extends true ? T | undefined : T;
export interface WatchCachedOptions<Immediate = boolean> {
  immediate?: Immediate;
  deep?: boolean;
  // when `once` is needed, caching is useless, use plain watch instead
}
export function watchCached<T, Immediate extends Readonly<boolean> = false>(
  source: WatchSource<T>,
  cb: WatchCallback<T, MaybeUndefined<T, Immediate>>,
  options?: WatchCachedOptions<Immediate>,
): WatchHandle {
  const cachedValue = ref<T>();
  const handle = watch(
    source,
    (newValue) => {
      if (!isJsonEqual(newValue, cachedValue.value)) {
        cachedValue.value = newValue;
      }
    },
    {
      deep: options?.deep,
      immediate: true, // always initialize cachedValue
    },
  );
  watch<T, Immediate>(
    () => cachedValue.value as T, // `as T` is safe as we always initialize cachedValue
    cb, // separate watch so that `onWatcherCleanup` would only be triggerred here
    {
      // standard vue `WatchOptions` conform to `WatchCachedOptions` interface,
      // so construct new options to remove unsupported entries
      deep: options?.deep,
      immediate: options?.immediate,
    },
  );
  return handle; // stopping first handle would effectively stop the second one
}
