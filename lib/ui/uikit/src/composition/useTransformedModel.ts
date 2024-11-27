import type { Ref, UnwrapNestedRefs } from 'vue';
import { reactive, computed, ref } from 'vue';

/**
 * Creates a reactive local model with optional transformation and validation logic.
 *
 * @template T The type of the model's value.
 *
 * @param model - A `Ref` representing the underlying value.
 * @param options - Optional configuration for validation and parsing.
 * @param options.update - A function that takes the transformed value and returns `true` if it should be applied to the model, or `false` to keep it in a cached state.
 * @param options.parse - A function that takes the input value and returns a transformed value of type `T`. If omitted, the value is used as-is.
 *
 * @returns A reactive object with the following properties:
 * - `value`: A computed property for getting and setting the model value.
 * - `error`: A `Ref<string | undefined>` containing the last error message, if any.
 * - `reset`: A method to clear the cached value and error state.
 *
 * ### Example
 * ```ts
 * import { ref } from 'vue';
 * import { useTransformedModel } from './useTransformedModel';
 *
 * const model = ref<number>(42);
 *
 * const transformedModel = useTransformedModel(model, {
 *   parse: (value) => {
 *     const parsed = Number(value);
 *     if (!Number.isFinite(parsed)) throw new Error('Invalid number');
 *     return parsed;
 *   },
 *   update: (value) => value >= 0, // Only allow non-negative numbers
 * });
 */

export function useTransformedModel<T>(model: Ref<T>, options: { update?: (v: T) => boolean; parse?: (v: unknown) => T }) {
  const cached = ref<T | undefined>();
  const error = ref<string>();

  const { parse, update } = options;

  const reset = () => {
    cached.value = undefined;
    error.value = undefined;
  };

  const value = computed<T>({
    get() {
      if (cached.value !== undefined) {
        return cached.value;
      }

      return model.value;
    },
    set(value) {
      reset();

      try {
        const newValue = parse ? parse(value) : value;

        const shouldUpdate = update ? update(newValue) : true;

        if (shouldUpdate) {
          model.value = newValue;
        } else {
          cached.value = newValue;
        }
      } catch (err) {
        cached.value = value;
        error.value = err instanceof Error ? err.message : String(err);
      }
    },
  });

  return reactive({
    value,
    error,
    reset,
  }) as UnwrapNestedRefs<{ value: T; error?: string; reset: () => void }>;
}
