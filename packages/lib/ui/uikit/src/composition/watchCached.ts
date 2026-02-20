import { deepClone, isJsonEqual } from "@milaboratories/helpers";
import { ref, watch, type WatchCallback, type WatchHandle, type WatchSource } from "vue";

type MaybeUndefined<T, I> = I extends true ? T | undefined : T;
export interface WatchCachedOptions<Immediate = boolean> {
  immediate?: Immediate;
  // deep: true; - caching is useless when you are using the source as a `shallowRef`
  // once: false; - caching is useless when you need a single shot, use plain watch instead
}
/** Alternative to `watch`, but triggering only on actual data changes */
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
        // `deepClone` is needed because in case some fields are patched the deep would be triggered,
        // but objects would be equal as the saved value was also patched
        cachedValue.value = deepClone(newValue);
      }
    },
    {
      deep: true,
      immediate: true, // always initialize cachedValue
    },
  );
  watch<T, Immediate>(
    () => cachedValue.value as T, // `as T` is safe as we always initialize cachedValue
    cb, // separate watch so that `onWatcherCleanup` would only be triggerred here
    {
      // standard vue `WatchOptions` conform to `WatchCachedOptions` interface,
      // so construct new options to remove unsupported entries
      deep: true,
      immediate: options?.immediate,
    },
  );
  return handle; // stopping first handle would effectively stop the second one
}
