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
 *
 * With `writeThrough`, a set updates the cache synchronously, so a read reflects
 * the write immediately even when `set` defers its work (e.g. debounced); the
 * getter must then map set values to themselves (`get(x)` deep-equals `x`).
 */
export function computedCached<T>(options: {
  get: ComputedGetter<T>;
  set: ComputedSetter<T>;
  writeThrough?: boolean;
}): WritableComputedRef<T>;
export function computedCached<T>(getter: ComputedGetter<T>): ComputedRef<T>;
export function computedCached<T>(
  arg:
    | ComputedGetter<T>
    | {
        get: ComputedGetter<T>;
        set: ComputedSetter<T>;
        writeThrough?: boolean;
      },
) {
  let getter: ComputedGetter<T>;
  let setter: ComputedSetter<T> | undefined = undefined;
  let writeThrough = false;
  if (typeof arg === "function") {
    getter = arg;
  } else {
    getter = arg.get;
    setter = arg.set;
    writeThrough = arg.writeThrough ?? false;
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
      set: writeThrough
        ? (newValue) => {
            // Reflect the value in the cache now; `set` itself may defer its work.
            if (!isJsonEqual(newValue, cachedValue.value)) cachedValue.value = deepClone(newValue);
            setter(newValue);
          }
        : setter,
    });
  } else {
    return cachedValue;
  }
}
