import { reactive, computed, ref, watch, unref, type ComputedRef, type UnwrapNestedRefs } from 'vue';
import type { ModelOptions, Model, AppSettings } from '../types';
import { deepClone, deepPatch } from '@milaboratories/helpers';
import { isJsonEqual, identity, ensureError, isZodError, formatZodError } from '../utils';

export function createAppModel<
  M extends { args: unknown; ui: unknown },
  V = unknown,
  E extends Record<string, ComputedRef<unknown>> = Record<string, ComputedRef<unknown>>,
>(options: ModelOptions<M, V>, extended: E, settings: AppSettings): Model<M & UnwrapNestedRefs<E>> {
  type R = M & UnwrapNestedRefs<E>;

  const validate = options.validate ?? identity;

  const { autoSave } = options;

  const error = ref<Error | undefined>();

  const local = ref<{ model: R; readonly stage: symbol }>();

  const setSource = (v: M) => {
    if (settings.deepPatchModel) {
      // deep patch
      const model = local.value?.model;
      const updated = Object.assign(deepClone(v), extended ?? {}) as R;
      local.value = {
        model: model ? deepPatch(model, updated) : updated,
        stage: Symbol(),
      };
    } else {
      // shallow replace
      local.value = {
        model: Object.assign(deepClone(v), extended ?? {}) as R,
        stage: Symbol(),
      };
    }
  };

  watch(
    () => options.get(),
    (v) => setSource(v),
    { immediate: true },
  );

  const save = () => {
    options.onSave(validate(deepClone(local.value?.model)));
  };

  const revert = () => {
    setSource(options.get());
    error.value = undefined;
  };

  const setError = (cause: unknown) => {
    const err = ensureError(cause);
    if (isZodError(err)) {
      error.value = Error(formatZodError(err)); // @todo temp
    } else {
      error.value = err;
    }
  };

  const setValue = (v: M) => {
    error.value = undefined;
    try {
      validate(v);
      if (autoSave) {
        save();
      }
    } catch (cause: unknown) {
      setError(cause);
    }
  };

  const model = computed<R>({
    get: () => {
      return local.value?.model as R;
    },
    set() {
      throw Error('Cannot replace base model');
    },
  });

  watch(
    [() => ({ args: model.value.args, ui: model.value.ui }), () => local.value?.stage],
    ([n, newStage], [_, oldStage]) => {
      if (newStage === oldStage) {
        setValue(n as M);
      }
    },
    { deep: true },
  );

  const valid = computed(() => !error.value);

  const isChanged = computed(() => {
    const { args, ui } = unref(local)?.model ?? {};
    return !isJsonEqual(options.get(), { args, ui });
  });

  const errorString = computed(() => (error.value ? error.value.message : ''));

  return reactive({
    model,
    valid,
    isChanged,
    error,
    errorString,
    save,
    revert,
    setError,
  });
}
