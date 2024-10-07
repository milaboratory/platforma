import { reactive, computed, ref, watch, unref } from 'vue';
import type { ModelOptions, Model } from './types';
import { deepClone } from '@milaboratories/helpers';
import { isJsonEqual, identity, ensureError, isZodError, formatZodError } from './utils';

export function createModel<M, V = unknown>(options: ModelOptions<M, V>): Model<M> {
  const validate = options.validate ?? identity;

  const { autoSave } = options;

  const error = ref<Error | undefined>();

  const local = ref<{ model: M }>();

  const setSource = (v: M) => {
    local.value = {
      model: deepClone(v),
    };
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

  const model = computed<M>({
    get: () => {
      return local.value?.model as M;
    },
    set(v) {
      setSource(v);
      setValue(v);
    },
  });

  watch(
    local,
    (n, o) => {
      if (n && n === o) {
        setValue(n.model);
      }
    },
    { deep: true },
  );

  const valid = computed(() => !error.value);

  const isChanged = computed(() => {
    return !isJsonEqual(options.get(), unref(local)); // @TODO, can be slow
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
