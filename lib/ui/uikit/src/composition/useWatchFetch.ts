import type { WatchSource, WatchOptions, MaybeRef } from 'vue';
import { reactive, watch, ref, computed, unref } from 'vue';
import { delay, exclusiveRequest } from '@milaboratories/helpers';

export type FetchResult<V, E = unknown> = {
  loading: boolean;
  value: V | undefined;
  error: E;
};

// TODO Should we keep the old value while fetching the new value?

/**
 * Watch any reactive source and perform an asynchronous operation
 *
 * @example
 * ```ts
 * const v = useWatchFetch(
 *   watchSource,
 *   async (sourceValue) => {
 *     return await fetchDataFromApi(sourceValue);
 *   }
 * );
 *
 * // Usage in a template
 * <template>
 *   <div v-if="v.loading">Loading...</div>
 *   <div v-else-if="v.error">Error: {{ v.error.message }}</div>
 *   <div v-else>Data: {{ v.value }}</div>
 * </template>
 * ```
 */
export function useWatchFetch<S, V>(
  watchSource: WatchSource<S>,
  doFetch: (s: S) => Promise<V>,
  settings?: {
    watchOptions?: WatchOptions;
    debounce?: MaybeRef<number>; // debounce time in ms
    filterWatchResult?: (s: S) => boolean; // prevents fetching if false
  },
): FetchResult<V> {
  const loadingRef = ref(0);

  const data = reactive({
    loading: computed(() => loadingRef.value > 0),
    loadingRef,
    value: undefined as V,
    error: undefined,
  }) as FetchResult<V>;

  const exclusive = exclusiveRequest(async (s: S) => {
    if (settings?.debounce) {
      await delay(unref(settings.debounce));
    }
    return doFetch(s);
  });

  watch(
    watchSource,
    async (s) => {
      if (settings?.filterWatchResult && !settings.filterWatchResult(s)) {
        return;
      }

      data.error = undefined;
      loadingRef.value++;
      exclusive(s)
        .then((res) => {
          if (res.ok) {
            data.value = res.value;
          }
        })
        .catch((err) => {
          data.value = undefined;
          data.error = err;
        })
        .finally(() => {
          loadingRef.value--;
        });
    },
    Object.assign({ immediate: true, deep: true }, settings?.watchOptions ?? {}),
  );

  return data;
}
