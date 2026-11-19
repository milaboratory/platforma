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
 *
 * A deferred set also leaves a window in which the source still holds the value
 * the write moved away from, and anything that re-emits the source during that
 * window — a running block having its project state pushed back, say — used to
 * revert the cache to it. The next write moved the cache forward again: a
 * ping-pong that never settled, and that whoever watches the value (the data
 * table rebuilds its whole grid) pays for on every swing. So a write-through
 * value stays authoritative until the source reports it back; since `get` maps
 * set values to themselves, that is exactly when the round trip has completed.
 * A change from elsewhere that arrives mid-flight is therefore dropped in
 * favour of the local write, which is about to land anyway.
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
  /** A write-through value the source has not reported back yet. */
  let writePending = false;
  watch(
    getter,
    (newValue) => {
      if (isJsonEqual(newValue, cachedValue.value)) {
        // The source has caught up with the write (or never diverged from it).
        writePending = false;
        return;
      }
      if (writePending) return;
      // `deepClone` is needed because in case some fields are patched the deep would be triggered,
      // but objects would be equal as the saved value was also patched
      cachedValue.value = deepClone(newValue);
    },
    { deep: true },
  );

  if (setter) {
    return computed({
      get: () => cachedValue.value,
      set: writeThrough
        ? (newValue) => {
            // Reflect the value in the cache now; `set` itself may defer its work.
            if (!isJsonEqual(newValue, cachedValue.value)) {
              cachedValue.value = deepClone(newValue);
              writePending = true;
            }
            setter(newValue);
          }
        : setter,
    });
  } else {
    return cachedValue;
  }
}
