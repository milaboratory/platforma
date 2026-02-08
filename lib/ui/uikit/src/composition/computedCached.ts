import { deepClone, isJsonEqual } from "@milaboratories/helpers";
import {
  computed,
  ref,
  watch,
  type ComputedGetter,
  type ComputedSetter,
  type ComputedRef,
  type WritableComputedRef,
} from "vue";

/**
 * Alternative to `computed`, but triggering only on actual data changes.
 * Always `deep` as the plain `computed` is.
 */
export function computedCached<T>(options: {
  get: ComputedGetter<T>;
  set: ComputedSetter<T>;
}): WritableComputedRef<T>;
export function computedCached<T>(getter: ComputedGetter<T>): ComputedRef<T>;
export function computedCached<T>(
  arg:
    | ComputedGetter<T>
    | {
        get: ComputedGetter<T>;
        set: ComputedSetter<T>;
      },
) {
  let getter: ComputedGetter<T>;
  let setter: ComputedSetter<T> | undefined = undefined;
  if (typeof arg === "function") {
    getter = arg;
  } else {
    getter = arg.get;
    setter = arg.set;
  }

  const cachedValue = ref<T>(getter());
  watch(
    getter,
    (newValue) => {
      if (!isJsonEqual(newValue, cachedValue.value)) {
        // `deepClone` is needed because in case some fields are patched the deep would be triggered,
        // but objects would be equal as the saved value was also patched
        cachedValue.value = deepClone(newValue);
      }
    },
    { deep: true },
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
