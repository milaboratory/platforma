import type { ComputedRef } from 'vue';
import { computed, type ComputedGetter } from 'vue';
import type { OptionalResult } from './types';
import { wrapOptionalResult } from './utils';

/**
 * Creates a computed reference that wraps the result of a getter function in an `OptionalResult` object.
 * This wrapper provides error handling, ensuring that if an error occurs during the computation of the result,
 * the error is captured and included in the `OptionalResult` instead of throwing the error.
 *
 * @template V - The type of the value returned by the getter function.
 *
 * @param {ComputedGetter<V>} getter - A function that returns a value of type `V`. This function is executed inside
 * the computed reference and its result is wrapped in an `OptionalResult`.
 *
 * @returns {ComputedRef<OptionalResult<V>>} - A computed reference containing the result of the getter function
 * wrapped in an `OptionalResult`. If the getter function executes successfully, the `value` property of the `OptionalResult`
 * will contain the result. If an error occurs, the `errors` property will contain the error message, and `value` will be `undefined`.
 *
 * @example
 * const myGetter = () => {
 *   if (someCondition) {
 *     throw new Error('An error occurred');
 *   }
 *   return 'Success';
 * };
 *
 * const myComputedResult = computedResult(myGetter);
 *
 * // If someCondition is true:
 * // myComputedResult.value will be { errors: ['An error occurred'], value: undefined }
 *
 * // If someCondition is false:
 * // myComputedResult.value will be { errors: undefined, value: 'Success' }
 */
export function computedResult<V>(getter: ComputedGetter<V>): ComputedRef<OptionalResult<V>> {
  return computed(() => {
    try {
      return wrapOptionalResult(getter());
    } catch (err) {
      return {
        errors: [String(err)],
        value: undefined,
      };
    }
  });
}
