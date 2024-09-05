import { computed, type Ref } from 'vue';

export function validateFormValue<T>(value: T, rules: ((v: T) => boolean | string)[]) {
  const errors: string[] = [];
  if (rules && rules.length > 0) {
    rules.forEach((rule) => {
      const err = rule(value);
      if (typeof err === 'string') {
        errors.push(err);
      }
    });
  }
  return {
    isValid: errors.length === 0,
    errors: errors,
  };
}

export function useValidation<T>(val: Ref<T>, rules: ((v: T) => boolean | string)[]) {
  return computed(() => {
    return validateFormValue(val.value, rules);
  });
}
