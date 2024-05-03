import type { Ref, UnwrapRef } from 'vue';
import { reactive, watch } from 'vue';
import { objects } from '@milaboratory/helpers';

export function useFormState<Source, D extends Record<string, unknown>>(
  source: Ref<Source>,
  fromSource: (source: Source) => D,
  update: (data: UnwrapRef<D>) => void,
) {
  const state: {
    data: UnwrapRef<D>;
    changed: boolean;
  } = reactive({
    data: objects.deepClone(fromSource(source.value)) as D,
    changed: false,
  });

  watch(
    () => state.data,
    (data) => {
      if (state.changed) {
        update(objects.deepClone(data));
      } else {
        state.changed = true;
      }
    },
    { deep: true },
  );

  watch(
    source,
    (s) => {
      Object.assign(state, {
        data: objects.deepClone(fromSource(s)),
        changed: false,
      });
    },
    { deep: true, immediate: true },
  );

  return state;
}
