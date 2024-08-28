import { computed, type Ref } from 'vue';

export function useValidation<T>(val: Ref<T>, rules: ((v: T) => boolean | string)[]) {
  return computed(() => {
    const errors: string[] = [];
    if (rules && rules.length > 0) {
      rules.forEach((rule) => {
        const err = rule(val.value);
        if (typeof err === 'string') {
          errors.push(err);
        }
      });
    }
    return {
      isValid: errors.length === 0,
      errors: errors,
    };
  });
}
