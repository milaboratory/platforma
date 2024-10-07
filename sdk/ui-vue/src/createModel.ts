import { reactive, computed, ref, watch, unref } from 'vue';
import type { ZodError } from 'zod';
import type { ModelOptions, Model } from './types';
import { deepEqual, deepClone } from '@milaboratories/helpers';
import { isJsonEqual } from './utils';

const identity = <T, V = T>(v: T): V => v as unknown as V;

const ensureError = (cause: unknown) => {
  if (cause instanceof Error) {
    return cause;
  }

  return Error(String(cause));
};

const isZodError = (err: Error): err is ZodError => {
  return err.name === 'ZodError';
};

const formatZodError = (err: ZodError) => {
  const { formErrors, fieldErrors } = err.flatten();
  const _fieldErrors = Object.entries(fieldErrors).map(([field, errors]) => {
    return field + ':' + errors?.join(',');
  });
  return formErrors.concat(_fieldErrors).join('; ');
};

export function createModel<M, V = unknown>(options: ModelOptions<M, V>): Model<M> {
  const validate = options.validate ?? identity;

  const { autoSave } = options;

  const error = ref<Error | undefined>();

  const local = ref<M>();

  watch(
    () => options.get(),
    (v) => {
      local.value = deepClone(v);
    },
    { immediate: true },
  );

  const save = () => {
    options.onSave(validate(deepClone(local.value)));
  };

  const revert = () => {
    local.value = deepClone(options.get());
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
      return local.value as M;
    },
    set(v) {
      local.value = v;
      setValue(v);
    },
  });

  watch(
    local,
    (v) => {
      if (!isJsonEqual(options.get(), v)) {
        setValue(v as M);
      }
    },
    { deep: true },
  );

  const valid = computed(() => !error.value);

  const isChanged = computed(() => {
    return !deepEqual(options.get(), unref(local));
  });

  const errorString = computed(() => (error.value ? error.value.message : ''));

  return reactive({
    model: model,
    valid,
    isChanged,
    error,
    errorString,
    save,
    revert,
    setError,
  });
}
