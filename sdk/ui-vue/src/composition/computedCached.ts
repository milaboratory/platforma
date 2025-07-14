import { isJsonEqual } from '@milaboratories/helpers';
import {
  computed,
  ref,
  watch,
  type ComputedGetter,
  type ComputedSetter,
  type ComputedRef,
  type WritableComputedRef,
} from 'vue';

export function computedCached<T>(options: {
  get: ComputedGetter<T>;
  set: ComputedSetter<T>;
  deep?: boolean;
}): WritableComputedRef<T>;
export function computedCached<T>(options: {
  get: ComputedGetter<T>;
  deep?: boolean;
}): ComputedRef<T>;
export function computedCached<T>(getter: ComputedGetter<T>): ComputedRef<T>;
export function computedCached<T>(options: ComputedGetter<T> | {
  get: ComputedGetter<T>;
  set?: ComputedSetter<T>;
  deep?: boolean;
}) {
  if (typeof options === 'function') {
    options = {
      get: options,
    };
  }
  const { get: getter, set: setter, deep } = options;

  const cachedValue = ref<T>(getter());
  watch(
    getter,
    (newValue) => {
      if (!isJsonEqual(newValue, cachedValue.value)) {
        cachedValue.value = newValue;
      }
    },
    { deep },
  );

  if (setter) {
    return computed({
      get: () => cachedValue.value,
      set: (newValue) => {
        if (!isJsonEqual(newValue, cachedValue.value)) {
          cachedValue.value = newValue;
          setter(newValue);
        }
      },
    });
  } else {
    return computed(() => cachedValue.value);
  }
}
