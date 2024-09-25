import type { WatchSource } from 'vue';
import { reactive, watch } from 'vue';
import type { OptionalResult } from '../types';

/**
 * Use for synchronous/asynchronous converters (wip)
 */
export function useWatchResult<S, V>(watchSource: WatchSource<S>, load: (s: S) => Promise<V> | V): OptionalResult<V> {
  const data = reactive({
    value: undefined as unknown,
    errors: undefined as unknown,
  });

  const state = {
    version: 0,
  };

  const resolve = async (s: S, version: number) => {
    const value = await load(s);
    return { value, version };
  };

  watch(
    watchSource,
    async (s) => {
      data.errors = undefined;
      data.value = undefined;
      try {
        const { value, version } = await resolve(s, ++state.version);

        if (version === state.version) {
          data.value = value;
        }
      } catch (error) {
        data.errors = [String(error)];
      }
    },
    { immediate: true, deep: true },
  );

  return data as OptionalResult<V>;
}
